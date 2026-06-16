let sessionsCa = [];
let sessionsAg = [];

// ── Mot de passe ──────────────────────────────────────────────────────────────

async function checkMdpAdmin() {
  const input = document.getElementById('mdp-input');
  const btn   = document.getElementById('btn-mdp');
  const err   = document.getElementById('mdp-error');
  const val   = input.value;

  btn.disabled    = true;
  btn.textContent = '...';

  const { data: ok, error } = await sb.rpc('verify_mdp_admin', { mdp: val });

  btn.disabled    = false;
  btn.textContent = 'Accéder →';

  if (error) { showToast('Erreur : ' + error.message); return; }

  if (ok === true) {
    sessionStorage.setItem('admin_auth', '1');
    document.getElementById('mdp-section').style.display  = 'none';
    document.getElementById('admin-panel').style.display  = 'block';
    await loadAllSessions();
  } else {
    err.style.display = 'block';
    input.value = '';
    input.focus();
    setTimeout(() => { err.style.display = 'none'; }, 2500);
  }
}

function logoutAdmin() { sessionStorage.removeItem('admin_auth'); location.reload(); }

window.addEventListener('DOMContentLoaded', async () => {
  if (sessionStorage.getItem('admin_auth') === '1') {
    document.getElementById('mdp-section').style.display  = 'none';
    document.getElementById('admin-panel').style.display  = 'block';
    await loadAllSessions();
  } else {
    document.getElementById('mdp-input').focus();
  }
});

// ── Onglets ───────────────────────────────────────────────────────────────────

function switchAdminTab(tab) {
  document.getElementById('panel-ca').style.display = tab === 'ca' ? 'block' : 'none';
  document.getElementById('panel-ag').style.display = tab === 'ag' ? 'block' : 'none';
  document.getElementById('tab-ca').classList.toggle('active', tab === 'ca');
  document.getElementById('tab-ag').classList.toggle('active', tab === 'ag');
}

// ── Chargement global ─────────────────────────────────────────────────────────

async function loadAllSessions() {
  const { data } = await sb.from('sessions').select('*').order('created_at', { ascending: false });
  const all = data || [];
  sessionsCa = all.filter(s => s.type === 'CA');
  sessionsAg = all.filter(s => s.type === 'AG');
  populateSelectsCa();
  populateSelectsAg();
  if (sessionsCa.length) loadAdminResCa();
  if (sessionsAg.length) loadAdminResAg();
  loadDocsAdmin();
}

// ════════════════════════════════════════════════════════
// COMITÉ DIRECTEUR
// ════════════════════════════════════════════════════════

function populateSelectsCa() {
  const opts  = sessionsCa.map(s => '<option value="' + s.id + '">' + s.titre + ' — ' + s.statut + '</option>').join('');
  const empty = '<option>— aucune session —</option>';
  document.getElementById('ca-r-session').innerHTML    = opts || empty;
  document.getElementById('ca-view-session').innerHTML = opts || empty;
}

async function createSessionCa() {
  const titre = document.getElementById('ca-s-titre').value.trim();
  if (!titre) return showToast('Titre requis');
  const { error } = await sb.from('sessions').insert({ titre, type: 'CA' });
  if (error) return showToast('Erreur : ' + error.message);
  showToast('Session CA créée ✅');
  document.getElementById('ca-s-titre').value = '';
  await loadAllSessions();
}

async function createResolutionCa() {
  const session_id  = document.getElementById('ca-r-session').value;
  const numero      = parseInt(document.getElementById('ca-r-numero').value);
  const titre       = document.getElementById('ca-r-titre').value.trim();
  const description = document.getElementById('ca-r-desc').value.trim();
  if (!session_id || !titre) return showToast('Session et titre requis');
  const { error } = await sb.from('resolutions').insert({ session_id, numero, titre, description, type_resolution: 'ca_2tiers' });
  if (error) return showToast('Erreur : ' + error.message);
  showToast('Résolution ajoutée ✅');
  document.getElementById('ca-r-titre').value  = '';
  document.getElementById('ca-r-desc').value   = '';
  document.getElementById('ca-r-numero').value = numero + 1;
  await loadAdminResCa();
}

async function toggleSessionCa(statut) {
  const id = document.getElementById('ca-view-session').value;
  if (!id) return;
  await sb.from('sessions').update({ statut }).eq('id', id);
  showToast(statut === 'ouverte' ? 'Session ouverte ✅' : 'Session fermée');
  await loadAllSessions();
}

async function refreshAdminCa() { await loadAllSessions(); showToast('Actualisé'); }

async function loadAdminResCa() {
  const sessionId = document.getElementById('ca-view-session').value;
  if (!sessionId) return;
  const session = sessionsCa.find(s => s.id === sessionId);

  const tog = document.getElementById('ca-session-toggle');
  tog.style.display = 'flex';
  tog.innerHTML = session?.statut === 'fermee'
    ? '<button class="btn-sm-green" onclick="toggleSessionCa(\'ouverte\')">▶ Ouvrir la session</button>'
    : '<button class="btn-sm-red"   onclick="toggleSessionCa(\'fermee\')">■ Fermer la session</button>';

  const { data: resolutions } = await sb
    .from('resolutions').select('*').eq('session_id', sessionId).order('numero');

  if (!resolutions?.length) {
    document.getElementById('ca-admin-res-list').innerHTML =
      '<div class="empty-state"><p>Aucune résolution pour cette session</p></div>';
    return;
  }

  const resIds = resolutions.map(r => r.id);
  const { data: votes } = await sb.from('votes').select('resolution_id, choix').in('resolution_id', resIds);

  const counts = {};
  resIds.forEach(id => { counts[id] = { pour: 0, contre: 0, abstention: 0, total: 0 }; });
  (votes || []).forEach(v => {
    if (counts[v.resolution_id]) { counts[v.resolution_id][v.choix]++; counts[v.resolution_id].total++; }
  });

  document.getElementById('ca-admin-res-list').innerHTML =
    resolutions.map(r => renderAdminCardCa(r, counts[r.id])).join('');
}

function renderAdminCardCa(r, c) {
  const total    = c.total || 0;
  const exprimes = c.pour + c.contre;
  // CA : 2/3 des exprimés (Art. 9)
  const adopte   = exprimes > 0 && (c.pour / exprimes) >= (2 / 3);
  const pct      = v => total ? Math.round((v / total) * 100) : 0;

  const badge     = r.statut === 'ouverte' ? '<span class="badge-open">Ouvert</span>' : '<span class="badge-closed">Fermé</span>';
  const toggleBtn = r.statut === 'fermee'
    ? '<button class="btn-sm-green" onclick="toggleResCa(\'' + r.id + '\',\'ouverte\')">Ouvrir</button>'
    : '<button class="btn-sm-red"   onclick="toggleResCa(\'' + r.id + '\',\'fermee\')">Fermer</button>';

  return '<div class="res-admin ' + (r.statut === 'ouverte' ? 'open' : '') + '">'
    + '<div class="res-admin-top">'
    +   '<div><div class="res-admin-num">Résolution n°' + r.numero + ' ' + badge + '</div>'
    +        '<div class="res-admin-titre">' + r.titre + '</div></div>'
    +   '<div class="res-actions">' + toggleBtn
    +     '<button class="btn-sm-grey" onclick="deleteResCa(\'' + r.id + '\')">🗑</button>'
    +   '</div>'
    + '</div>'
    + barRow('✅ Pour',       c.pour,       '#48bb78', pct(c.pour))
    + barRow('❌ Contre',     c.contre,     '#fc8181', pct(c.contre))
    + barRow('⚪ Abstention', c.abstention, '#f6e05e', pct(c.abstention))
    + '<div class="vote-total">' + total + ' vote' + (total > 1 ? 's' : '') + ' — Majorité 2/3 — '
    + (exprimes > 0 ? (adopte ? '✅ Adopté aux 2/3' : '❌ Rejeté (2/3 non atteints)') : 'Aucun vote exprimé')
    + '</div></div>';
}

async function toggleResCa(resId, statut) {
  await sb.from('resolutions').update({ statut }).eq('id', resId);
  await loadAdminResCa();
}

async function deleteResCa(resId) {
  if (!confirm('Supprimer cette résolution et tous ses votes ?')) return;
  await sb.from('votes').delete().eq('resolution_id', resId);
  await sb.from('resolutions').delete().eq('id', resId);
  showToast('Supprimé');
  await loadAdminResCa();
}

// ════════════════════════════════════════════════════════
// ASSEMBLÉE GÉNÉRALE
// ════════════════════════════════════════════════════════

function populateSelectsAg() {
  const opts  = sessionsAg.map(s => '<option value="' + s.id + '">' + s.titre + ' — ' + s.statut + '</option>').join('');
  const empty = '<option>— aucune session —</option>';
  document.getElementById('ag-r-session').innerHTML    = opts || empty;
  document.getElementById('ag-view-session').innerHTML = opts || empty;
}

async function createSessionAg() {
  const titre    = document.getElementById('ag-s-titre').value.trim();
  const total    = parseInt(document.getElementById('ag-s-total').value)    || 0;
  const presents = parseInt(document.getElementById('ag-s-presents').value) || 0;
  if (!titre) return showToast('Titre requis');
  const { error } = await sb.from('sessions').insert({
    titre, type: 'AG',
    nombre_membres_total: total,
    nombre_membres_presents: presents,
  });
  if (error) return showToast('Erreur : ' + error.message);
  showToast('Session AG créée ✅');
  document.getElementById('ag-s-titre').value    = '';
  document.getElementById('ag-s-total').value    = '';
  document.getElementById('ag-s-presents').value = '';
  await loadAllSessions();
}

async function createResolutionAg() {
  const session_id      = document.getElementById('ag-r-session').value;
  const numero          = parseInt(document.getElementById('ag-r-numero').value);
  const titre           = document.getElementById('ag-r-titre').value.trim();
  const description     = document.getElementById('ag-r-desc').value.trim();
  const type_resolution = document.getElementById('ag-r-type').value;
  if (!session_id || !titre) return showToast('Session et titre requis');
  const { error } = await sb.from('resolutions').insert({ session_id, numero, titre, description, type_resolution });
  if (error) return showToast('Erreur : ' + error.message);
  showToast('Résolution ajoutée ✅');
  document.getElementById('ag-r-titre').value  = '';
  document.getElementById('ag-r-desc').value   = '';
  document.getElementById('ag-r-numero').value = numero + 1;
  await loadAdminResAg();
}

async function toggleSessionAg(statut) {
  const id = document.getElementById('ag-view-session').value;
  if (!id) return;
  await sb.from('sessions').update({ statut }).eq('id', id);
  showToast(statut === 'ouverte' ? 'Session ouverte ✅' : 'Session fermée');
  await loadAllSessions();
}

async function refreshAdminAg() { await loadAllSessions(); showToast('Actualisé'); }

async function loadAdminResAg() {
  const sessionId = document.getElementById('ag-view-session').value;
  if (!sessionId) return;
  const session = sessionsAg.find(s => s.id === sessionId);

  const tog = document.getElementById('ag-session-toggle');
  tog.style.display = 'flex';
  tog.innerHTML = session?.statut === 'fermee'
    ? '<button class="btn-sm-green" onclick="toggleSessionAg(\'ouverte\')">▶ Ouvrir la session</button>'
    : '<button class="btn-sm-red"   onclick="toggleSessionAg(\'fermee\')">■ Fermer la session</button>';

  // Quorum info
  const qEl    = document.getElementById('ag-quorum-info');
  const total   = session?.nombre_membres_total    || 0;
  const present = session?.nombre_membres_presents || 0;
  if (total && present) {
    const pct14 = Math.ceil(total / 4);
    const q14   = present >= pct14;
    const q12   = present > total / 2;
    qEl.innerHTML = '<div class="quorum-box">'
      + '👥 <span>' + present + ' présents</span> / <span>' + total + ' licenciés</span>'
      + '<br><span style="color:' + (q14 ? '#48bb78' : '#fc8181') + '">Quorum modification statuts (1/4 = ' + pct14 + ') : ' + (q14 ? '✅ atteint' : '❌ non atteint') + '</span>'
      + (q12 ? '' : '<br><span style="color:#f6e05e">⚠️ Quorum dissolution non atteint — une AG extraordinaire peut délibérer 1h après (Art. 15)</span>')
      + (!q14 ? '<br><span style="color:#f6e05e">⚠️ Quorum statuts non atteint — convocation d\'une nouvelle assemblée nécessaire (Art. 14)</span>' : '')
      + '</div>';
  } else {
    qEl.innerHTML = '';
  }

  const { data: resolutions } = await sb
    .from('resolutions').select('*').eq('session_id', sessionId).order('numero');

  if (!resolutions?.length) {
    document.getElementById('ag-admin-res-list').innerHTML =
      '<div class="empty-state"><p>Aucune résolution pour cette session</p></div>';
    return;
  }

  const resIds = resolutions.map(r => r.id);
  const { data: votes } = await sb.from('votes').select('resolution_id, choix').in('resolution_id', resIds);

  const counts = {};
  resIds.forEach(id => { counts[id] = { pour: 0, contre: 0, abstention: 0, total: 0 }; });
  (votes || []).forEach(v => {
    if (counts[v.resolution_id]) { counts[v.resolution_id][v.choix]++; counts[v.resolution_id].total++; }
  });

  document.getElementById('ag-admin-res-list').innerHTML =
    resolutions.map(r => renderAdminCardAg(r, counts[r.id])).join('');
}

const AG_TYPE_LABELS = {
  ordinaire:   'Majorité simple',
  statuts:     '2/3 — Modification statuts',
  dissolution: '3/4 — Dissolution',
};

function computeResultAg(c, typeRes) {
  const exprimes = c.pour + c.contre;
  if (exprimes === 0) return { adopte: null, label: 'Aucun vote exprimé' };
  let adopte, label;
  if (typeRes === 'dissolution') {
    adopte = (c.pour / exprimes) >= (3 / 4);
    label  = adopte ? '✅ Adopté aux 3/4' : '❌ Rejeté (3/4 non atteint)';
  } else if (typeRes === 'statuts') {
    adopte = (c.pour / exprimes) >= (2 / 3);
    label  = adopte ? '✅ Adopté aux 2/3' : '❌ Rejeté (2/3 non atteint)';
  } else {
    adopte = c.pour > c.contre;
    label  = adopte ? '✅ Adopté (majorité simple)' : '❌ Rejeté';
  }
  return { adopte, label };
}

function renderAdminCardAg(r, c) {
  const total    = c.total || 0;
  const typeRes  = r.type_resolution || 'ordinaire';
  const typeLabel = AG_TYPE_LABELS[typeRes] || '';
  const pct      = v => total ? Math.round((v / total) * 100) : 0;
  const res      = computeResultAg(c, typeRes);

  const badge     = r.statut === 'ouverte' ? '<span class="badge-open">Ouvert</span>' : '<span class="badge-closed">Fermé</span>';
  const toggleBtn = r.statut === 'fermee'
    ? '<button class="btn-sm-green" onclick="toggleResAg(\'' + r.id + '\',\'ouverte\')">Ouvrir</button>'
    : '<button class="btn-sm-red"   onclick="toggleResAg(\'' + r.id + '\',\'fermee\')">Fermer</button>';

  return '<div class="res-admin ' + (r.statut === 'ouverte' ? 'open' : '') + '">'
    + '<div class="res-admin-top">'
    +   '<div><div class="res-admin-num">Résolution n°' + r.numero + ' ' + badge
    +        ' <span class="type-badge">' + typeLabel + '</span></div>'
    +        '<div class="res-admin-titre">' + r.titre + '</div></div>'
    +   '<div class="res-actions">' + toggleBtn
    +     '<button class="btn-sm-grey" onclick="deleteResAg(\'' + r.id + '\')">🗑</button>'
    +   '</div>'
    + '</div>'
    + barRow('✅ Pour',       c.pour,       '#48bb78', pct(c.pour))
    + barRow('❌ Contre',     c.contre,     '#fc8181', pct(c.contre))
    + barRow('⚪ Abstention', c.abstention, '#f6e05e', pct(c.abstention))
    + '<div class="vote-total">' + total + ' votant' + (total > 1 ? 's' : '') + ' — ' + res.label + '</div>'
    + '</div>';
}

async function toggleResAg(resId, statut) {
  await sb.from('resolutions').update({ statut }).eq('id', resId);
  await loadAdminResAg();
}

async function deleteResAg(resId) {
  if (!confirm('Supprimer cette résolution et tous ses votes ?')) return;
  await sb.from('votes').delete().eq('resolution_id', resId);
  await sb.from('resolutions').delete().eq('id', resId);
  showToast('Supprimé');
  await loadAdminResAg();
}

// ── Utilitaires ───────────────────────────────────────────────────────────────

function barRow(label, val, color, pct) {
  return '<div class="bar-row">'
    + '<span class="bar-label">' + label + '</span>'
    + '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:' + color + ';"></div></div>'
    + '<span class="bar-count">' + val + '</span>'
    + '</div>';
}

// ── Documents ─────────────────────────────────────────────────────────────────

async function addDocument() {
  const type  = document.getElementById('d-type').value;
  const titre = document.getElementById('d-titre').value.trim();
  const url   = document.getElementById('d-url').value.trim();
  if (!titre || !url) return showToast('Titre et URL requis');
  const { error } = await sb.from('documents').insert({ type, titre, url });
  if (error) return showToast('Erreur : ' + error.message);
  showToast('Document ajouté ✅');
  document.getElementById('d-titre').value = '';
  document.getElementById('d-url').value   = '';
  await loadDocsAdmin();
}

async function loadDocsAdmin() {
  const { data: docs } = await sb.from('documents').select('*').order('created_at', { ascending: false });
  const all = docs || [];
  const typeLabels = { reglement: '📋 Règlement', pv: '📝 PV' };
  const el = document.getElementById('docs-admin-list');
  if (!el) return;
  el.innerHTML = all.length
    ? all.map(d =>
        '<div style="display:flex;justify-content:space-between;align-items:center;background:#0d1f3c;border-radius:8px;padding:10px 14px;margin-bottom:8px;gap:10px;">'
        + '<div><div style="font-size:0.78rem;color:#C8A84B;">' + (typeLabels[d.type] || d.type) + '</div>'
        + '<div style="color:#fff;font-size:0.88rem;font-weight:600;">' + d.titre + '</div></div>'
        + '<button class="btn-sm-grey" onclick="deleteDoc(\'' + d.id + '\')">🗑</button>'
        + '</div>'
      ).join('')
    : '<p style="color:#4a5568;font-size:0.85rem;">Aucun document</p>';
}

async function deleteDoc(id) {
  if (!confirm('Supprimer ce document ?')) return;
  await sb.from('documents').delete().eq('id', id);
  showToast('Document supprimé');
  await loadDocsAdmin();
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}
