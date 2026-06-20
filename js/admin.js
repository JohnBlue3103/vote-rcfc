let sessionsCa = [];
let sessionsAg = [];
let resCache   = {}; // stocke les objets résolution pour le modal

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

// ── Membres AG ────────────────────────────────────────────────────────────────

async function loadMembresAg() {
  const { data, error } = await sb.rpc('admin_list_membres_ag');
  const el = document.getElementById('ag-membres-list');
  if (!el) return;
  if (error || !data?.length) {
    el.innerHTML = '<p style="color:#4a5568;font-size:0.82rem;">Aucun adhérent enregistré</p>';
    return;
  }
  el.innerHTML = data.map(m =>
    '<div style="display:flex;justify-content:space-between;align-items:center;background:#0d1f3c;border-radius:8px;padding:9px 12px;margin-bottom:6px;gap:8px;">'
    + '<div>'
    +   '<div style="color:#fff;font-size:0.85rem;font-weight:600;">' + m.nom + '</div>'
    +   '<div style="color:#C8A84B;font-size:0.78rem;letter-spacing:2px;">' + m.code + '</div>'
    + '</div>'
    + '<div style="display:flex;gap:6px;flex-shrink:0;">'
    + (m.actif
        ? '<button class="btn-sm-grey" onclick="toggleMembreAg(\'' + m.id + '\',false)">Désactiver</button>'
        : '<button class="btn-sm-green" onclick="toggleMembreAg(\'' + m.id + '\',true)">Activer</button>')
    + '<button class="btn-sm-grey" onclick="deleteMembreAg(\'' + m.id + '\')">🗑</button>'
    + '</div>'
    + '</div>'
  ).join('');
}

async function addMembreAg() {
  const nom  = document.getElementById('ag-m-nom').value.trim();
  const code = document.getElementById('ag-m-code').value.trim().toUpperCase();
  if (!nom || !code) return showToast('Nom et code requis');
  const { data: result, error } = await sb.rpc('admin_add_membre_ag', { p_nom: nom, p_code: code });
  if (error || !result?.ok) {
    showToast(result?.error === 'code_exists' ? 'Ce code existe déjà' : 'Erreur : ' + (result?.error || error?.message));
    return;
  }
  showToast('Adhérent ajouté ✅');
  document.getElementById('ag-m-nom').value  = '';
  document.getElementById('ag-m-code').value = '';
  await loadMembresAg();
}

async function toggleMembreAg(id, actif) {
  await sb.rpc('admin_toggle_membre_ag', { p_id: id, p_actif: actif });
  showToast(actif ? 'Adhérent activé' : 'Adhérent désactivé');
  await loadMembresAg();
}

async function deleteMembreAg(id) {
  if (!confirm('Supprimer cet adhérent ?')) return;
  await sb.rpc('admin_delete_membre_ag', { p_id: id });
  showToast('Adhérent supprimé');
  await loadMembresAg();
}

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
  loadMembresAg();
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

  resCache[r.id] = { ...r, scope: 'ca' };

  const badge     = r.statut === 'ouverte' ? '<span class="badge-open">Ouvert</span>' : '<span class="badge-closed">Fermé</span>';
  const toggleBtn = r.statut === 'fermee'
    ? '<button class="btn-sm-green" onclick="toggleResCa(\'' + r.id + '\',\'ouverte\')">Ouvrir</button>'
    : '<button class="btn-sm-red"   onclick="toggleResCa(\'' + r.id + '\',\'fermee\')">Fermer</button>';

  return '<div class="res-admin ' + (r.statut === 'ouverte' ? 'open' : '') + '" id="res-ca-' + r.id + '">'
    + '<div class="res-admin-top">'
    +   '<div><div class="res-admin-num">Résolution n°' + r.numero + ' ' + badge + '</div>'
    +        '<div class="res-admin-titre" onclick="openResModal(\'' + r.id + '\')" style="cursor:pointer;" title="Voir / modifier">' + r.titre + ' <span style="font-size:0.7rem;color:#C8A84B44;">↗</span></div></div>'
    +   '<div class="res-actions">' + toggleBtn
    +     '<button class="btn-sm-grey" onclick="openResModal(\'' + r.id + '\')" title="Modifier">✏️</button>'
    +     '<button class="btn-sm-grey" onclick="deleteResCa(\'' + r.id + '\')">🗑</button>'
    +   '</div>'
    + '</div>'
    + barRow('✅ Pour',       c.pour,       '#48bb78', pct(c.pour))
    + barRow('❌ Contre',     c.contre,     '#fc8181', pct(c.contre))
    + barRow('⚪ Abstention', c.abstention, '#f6e05e', pct(c.abstention))
    + (r.description ? '<div class="res-desc-preview">' + r.description + '</div>' : '')
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
  const presents = parseInt(document.getElementById('ag-s-presents').value) || 0;
  if (!titre) return showToast('Titre requis');
  const { error } = await sb.from('sessions').insert({
    titre, type: 'AG',
    nombre_membres_presents: presents,
  });
  if (error) return showToast('Erreur : ' + error.message);
  showToast('Session AG créée ✅');
  document.getElementById('ag-s-titre').value    = '';
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

  // Présents (info seulement)
  const qEl     = document.getElementById('ag-quorum-info');
  const present = session?.nombre_membres_presents || 0;
  qEl.innerHTML = present
    ? '<div class="quorum-box">👥 <span>' + present + ' membre' + (present > 1 ? 's' : '') + ' présent' + (present > 1 ? 's' : '') + '</span></div>'
    : '';

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

  resCache[r.id] = { ...r, scope: 'ag' };

  const badge     = r.statut === 'ouverte' ? '<span class="badge-open">Ouvert</span>' : '<span class="badge-closed">Fermé</span>';
  const toggleBtn = r.statut === 'fermee'
    ? '<button class="btn-sm-green" onclick="toggleResAg(\'' + r.id + '\',\'ouverte\')">Ouvrir</button>'
    : '<button class="btn-sm-red"   onclick="toggleResAg(\'' + r.id + '\',\'fermee\')">Fermer</button>';

  return '<div class="res-admin ' + (r.statut === 'ouverte' ? 'open' : '') + '" id="res-ag-' + r.id + '">'
    + '<div class="res-admin-top">'
    +   '<div><div class="res-admin-num">Résolution n°' + r.numero + ' ' + badge
    +        ' <span class="type-badge">' + typeLabel + '</span></div>'
    +        '<div class="res-admin-titre" onclick="openResModal(\'' + r.id + '\')" style="cursor:pointer;" title="Voir / modifier">' + r.titre + ' <span style="font-size:0.7rem;color:#C8A84B44;">↗</span></div></div>'
    +   '<div class="res-actions">' + toggleBtn
    +     '<button class="btn-sm-grey" onclick="openResModal(\'' + r.id + '\')" title="Modifier">✏️</button>'
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

// ── Modal détail / édition résolution ────────────────────────────────────────

let _modalResId = null;

function openResModal(resId) {
  const r     = resCache[resId];
  if (!r) return;
  _modalResId = resId;

  document.getElementById('modal-num').textContent = 'Résolution n°' + r.numero;

  const typeSelect = r.scope === 'ag'
    ? '<label style="font-size:0.82rem;color:#8fa8c8;margin:14px 0 4px;display:block;">Type de vote</label>'
      + '<select id="modal-type" style="width:100%;padding:9px;border:1.5px solid #1e3a5f;border-radius:8px;background:#0d1f3c;color:#fff;font-size:0.9rem;outline:none;font-family:inherit;">'
      + '<option value="ordinaire"'   + (r.type_resolution === 'ordinaire'   ? ' selected' : '') + '>Majorité simple (résolution ordinaire)</option>'
      + '<option value="statuts"'     + (r.type_resolution === 'statuts'     ? ' selected' : '') + '>Majorité 2/3 — Modification statuts</option>'
      + '<option value="dissolution"' + (r.type_resolution === 'dissolution' ? ' selected' : '') + '>Majorité 3/4 — Dissolution</option>'
      + '</select>'
    : '';

  const pm = r.votes_pour_manuel;
  const cm = r.votes_contre_manuel;
  const am = r.votes_abstention_manuel;
  const hasManuel = pm !== null && pm !== undefined;

  document.getElementById('modal-content').innerHTML =
      '<label style="font-size:0.82rem;color:#8fa8c8;margin-bottom:4px;display:block;">Titre</label>'
    + '<input id="modal-titre" type="text" value="' + r.titre.replace(/"/g, '&quot;') + '"'
    +   ' style="width:100%;padding:10px 12px;border:1.5px solid #1e3a5f;border-radius:8px;background:#0d1f3c;color:#fff;font-size:0.95rem;outline:none;font-family:inherit;margin-bottom:14px;box-sizing:border-box;"/>'
    + '<label style="font-size:0.82rem;color:#8fa8c8;margin-bottom:4px;display:block;">Description</label>'
    + '<textarea id="modal-desc"'
    +   ' style="width:100%;padding:10px 12px;border:1.5px solid #1e3a5f;border-radius:8px;background:#0d1f3c;color:#fff;font-size:0.9rem;resize:vertical;min-height:120px;outline:none;font-family:inherit;line-height:1.6;box-sizing:border-box;">'
    + (r.description || '') + '</textarea>'
    + typeSelect
    + '<div style="border-top:1px solid #1e3a5f;margin-top:18px;padding-top:16px;">'
    + '<div style="font-size:0.82rem;color:#C8A84B;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px;">Résultat présentiel</div>'
    + '<div style="font-size:0.78rem;color:#4a5568;margin-bottom:12px;">Si le vote a eu lieu en séance, saisir les chiffres ci-dessous — ils remplaceront le décompte en ligne dans le récapitulatif.</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">'
    + '<div><label style="font-size:0.78rem;color:#48bb78;display:block;margin-bottom:3px;">✅ Pour</label>'
    +   '<input id="modal-pour" type="number" min="0" value="' + (hasManuel ? pm : '') + '" placeholder="—"'
    +   ' style="width:100%;padding:8px;border:1.5px solid #1e3a5f;border-radius:7px;background:#0d1f3c;color:#fff;font-size:0.9rem;outline:none;box-sizing:border-box;"/></div>'
    + '<div><label style="font-size:0.78rem;color:#fc8181;display:block;margin-bottom:3px;">❌ Contre</label>'
    +   '<input id="modal-contre" type="number" min="0" value="' + (hasManuel ? cm : '') + '" placeholder="—"'
    +   ' style="width:100%;padding:8px;border:1.5px solid #1e3a5f;border-radius:7px;background:#0d1f3c;color:#fff;font-size:0.9rem;outline:none;box-sizing:border-box;"/></div>'
    + '<div><label style="font-size:0.78rem;color:#f6e05e;display:block;margin-bottom:3px;">⚪ Abstention</label>'
    +   '<input id="modal-abstention" type="number" min="0" value="' + (hasManuel ? am : '') + '" placeholder="—"'
    +   ' style="width:100%;padding:8px;border:1.5px solid #1e3a5f;border-radius:7px;background:#0d1f3c;color:#fff;font-size:0.9rem;outline:none;box-sizing:border-box;"/></div>'
    + '</div>'
    + (hasManuel ? '<button onclick="clearManuel()" style="margin-top:10px;background:transparent;border:1px solid #4a5568;color:#4a5568;border-radius:7px;padding:5px 12px;font-size:0.78rem;cursor:pointer;">🗑 Effacer résultat présentiel</button>' : '')
    + '</div>'
    + '<div style="display:flex;gap:10px;margin-top:18px;">'
    + '<button onclick="saveResModal()" style="flex:1;background:#C8A84B;color:#0d1f3c;border:none;border-radius:10px;padding:12px;font-weight:800;font-size:0.95rem;cursor:pointer;">Enregistrer</button>'
    + '<button onclick="closeResModal()" style="background:transparent;border:1.5px solid #8fa8c8;color:#8fa8c8;border-radius:10px;padding:12px 18px;cursor:pointer;font-weight:600;">Annuler</button>'
    + '</div>';

  document.getElementById('res-modal').style.display = 'block';
  document.body.style.overflow = 'hidden';
}

function closeResModal() {
  document.getElementById('res-modal').style.display = 'none';
  document.body.style.overflow = '';
  _modalResId = null;
}

async function saveResModal() {
  const resId       = _modalResId;
  const r           = resCache[resId];
  const titre       = document.getElementById('modal-titre').value.trim();
  const description = document.getElementById('modal-desc').value.trim();
  const typeEl      = document.getElementById('modal-type');
  const type_resolution = typeEl ? typeEl.value : undefined;

  const pourVal  = document.getElementById('modal-pour').value;
  const contreVal= document.getElementById('modal-contre').value;
  const abstVal  = document.getElementById('modal-abstention').value;

  if (!titre) return showToast('Le titre ne peut pas être vide');

  const update = { titre, description };
  if (type_resolution) update.type_resolution = type_resolution;

  // Résultat présentiel : si au moins un champ rempli, on sauvegarde les 3
  if (pourVal !== '' || contreVal !== '' || abstVal !== '') {
    update.votes_pour_manuel       = parseInt(pourVal)   || 0;
    update.votes_contre_manuel     = parseInt(contreVal) || 0;
    update.votes_abstention_manuel = parseInt(abstVal)   || 0;
  }

  const { error } = await sb.from('resolutions').update(update).eq('id', resId);
  if (error) return showToast('Erreur : ' + error.message);

  showToast('Résolution mise à jour ✅');
  closeResModal();
  if (r.scope === 'ca') await loadAdminResCa();
  else                  await loadAdminResAg();
}

async function clearManuel() {
  const resId = _modalResId;
  const r     = resCache[resId];
  await sb.from('resolutions').update({
    votes_pour_manuel: null, votes_contre_manuel: null, votes_abstention_manuel: null,
  }).eq('id', resId);
  showToast('Résultat présentiel supprimé');
  closeResModal();
  if (r.scope === 'ca') await loadAdminResCa();
  else                  await loadAdminResAg();
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
