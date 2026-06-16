let sessions = [];

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
    document.getElementById('mdp-section').style.display  = 'none';
    document.getElementById('admin-panel').style.display  = 'block';
    await loadSessions();
  } else {
    err.style.display = 'block';
    input.value = '';
    input.focus();
    setTimeout(() => { err.style.display = 'none'; }, 2500);
  }
}

function logoutAdmin() { location.reload(); }

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('mdp-input').focus();
});

// ── Sessions ──────────────────────────────────────────────────────────────────

async function loadSessions() {
  const { data } = await sb.from('sessions').select('*').order('created_at', { ascending: false });
  sessions = data || [];
  populateSelects();
  if (sessions.length) loadAdminRes();
  loadDocsAdmin();
}

function populateSelects() {
  const opts = sessions.map(s =>
    '<option value="' + s.id + '">[' + s.type + '] ' + s.titre + ' — ' + s.statut + '</option>'
  ).join('');
  const empty = '<option>— aucune session —</option>';
  document.getElementById('r-session').innerHTML    = opts || empty;
  document.getElementById('view-session').innerHTML = opts || empty;
}

async function createSession() {
  const titre = document.getElementById('s-titre').value.trim();
  const type  = document.getElementById('s-type').value;
  if (!titre) return showToast('Titre requis');
  const { error } = await sb.from('sessions').insert({ titre, type });
  if (error) return showToast('Erreur : ' + error.message);
  showToast('Session créée ✅');
  document.getElementById('s-titre').value = '';
  await loadSessions();
}

async function toggleSession(statut) {
  const id = document.getElementById('view-session').value;
  if (!id) return;
  await sb.from('sessions').update({ statut }).eq('id', id);
  showToast(statut === 'ouverte' ? 'Session ouverte ✅' : 'Session fermée');
  await loadSessions();
}

async function refreshAdmin() {
  await loadSessions();
  showToast('Actualisé');
}

// ── Résolutions ───────────────────────────────────────────────────────────────

async function createResolution() {
  const session_id  = document.getElementById('r-session').value;
  const numero      = parseInt(document.getElementById('r-numero').value);
  const titre       = document.getElementById('r-titre').value.trim();
  const description = document.getElementById('r-desc').value.trim();
  if (!session_id || !titre) return showToast('Session et titre requis');
  const { error } = await sb.from('resolutions').insert({ session_id, numero, titre, description });
  if (error) return showToast('Erreur : ' + error.message);
  showToast('Résolution ajoutée ✅');
  document.getElementById('r-titre').value  = '';
  document.getElementById('r-desc').value   = '';
  document.getElementById('r-numero').value = numero + 1;
  await loadAdminRes();
}

async function loadAdminRes() {
  const sessionId = document.getElementById('view-session').value;
  if (!sessionId) return;

  const session = sessions.find(s => s.id === sessionId);

  // Boutons ouvrir/fermer session
  const tog = document.getElementById('session-toggle');
  tog.style.display = 'flex';
  tog.innerHTML = session?.statut === 'fermee'
    ? '<button class="btn-sm-green" onclick="toggleSession(\'ouverte\')">▶ Ouvrir la session</button>'
    : '<button class="btn-sm-red"   onclick="toggleSession(\'fermee\')">■ Fermer la session</button>';

  const { data: resolutions } = await sb
    .from('resolutions').select('*').eq('session_id', sessionId).order('numero');

  if (!resolutions?.length) {
    document.getElementById('admin-res-list').innerHTML =
      '<div class="empty-state"><p>Aucune résolution pour cette session</p></div>';
    return;
  }

  // Votes par résolution
  const resIds = resolutions.map(r => r.id);
  const { data: votes } = await sb.from('votes').select('resolution_id, choix').in('resolution_id', resIds);

  const counts = {};
  resIds.forEach(id => { counts[id] = { pour: 0, contre: 0, abstention: 0, total: 0 }; });
  (votes || []).forEach(v => {
    if (counts[v.resolution_id]) {
      counts[v.resolution_id][v.choix]++;
      counts[v.resolution_id].total++;
    }
  });

  document.getElementById('admin-res-list').innerHTML =
    resolutions.map(r => renderAdminCard(r, counts[r.id])).join('');
}

function renderAdminCard(r, c) {
  const total = c.total || 0;
  const pct   = v => total ? Math.round((v / total) * 100) : 0;

  function barRow(label, val, color) {
    return '<div class="bar-row">'
      + '<span class="bar-label">' + label + '</span>'
      + '<div class="bar-track"><div class="bar-fill" style="width:' + pct(val) + '%;background:' + color + ';"></div></div>'
      + '<span class="bar-count">' + val + '</span>'
      + '</div>';
  }

  const badge = r.statut === 'ouverte'
    ? '<span class="badge-open">Ouvert</span>'
    : '<span class="badge-closed">Fermé</span>';

  const toggleBtn = r.statut === 'fermee'
    ? '<button class="btn-sm-green" onclick="toggleRes(\'' + r.id + '\',\'ouverte\')">Ouvrir</button>'
    : '<button class="btn-sm-red"   onclick="toggleRes(\'' + r.id + '\',\'fermee\')">Fermer</button>';

  return '<div class="res-admin ' + (r.statut === 'ouverte' ? 'open' : '') + '">'
    + '<div class="res-admin-top">'
    +   '<div>'
    +     '<div class="res-admin-num">Résolution n°' + r.numero + ' ' + badge + '</div>'
    +     '<div class="res-admin-titre">' + r.titre + '</div>'
    +   '</div>'
    +   '<div class="res-actions">' + toggleBtn
    +     '<button class="btn-sm-grey" onclick="deleteRes(\'' + r.id + '\')">🗑</button>'
    +   '</div>'
    + '</div>'
    + barRow('✅ Pour',       c.pour,       '#48bb78')
    + barRow('❌ Contre',     c.contre,     '#fc8181')
    + barRow('⚪ Abstention', c.abstention, '#f6e05e')
    + '<div class="vote-total">' + total + ' vote' + (total > 1 ? 's' : '') + ' enregistré' + (total > 1 ? 's' : '') + '</div>'
    + '</div>';
}

async function toggleRes(resId, statut) {
  await sb.from('resolutions').update({ statut }).eq('id', resId);
  await loadAdminRes();
}

async function deleteRes(resId) {
  if (!confirm('Supprimer cette résolution et tous ses votes ?')) return;
  await sb.from('resolutions').delete().eq('id', resId);
  showToast('Supprimé');
  await loadAdminRes();
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
