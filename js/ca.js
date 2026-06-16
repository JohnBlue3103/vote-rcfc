const MEMBRES_CA = [
  'John Bernard',    'Aderito Miranda',    'Gireg Rannou',      'Didier Mercadal',
  'Romain Hochedez', 'Alexandre Ruiz',     'Karim Hajjaji',     'Emmanuel Martinez',
  'Laurent Laborde', 'Tiffany Duclos',     'Laurent Cohen',     'Nicolas Broueilh',
  'Joël Chich',      'Brice Mamode',       'Yohan Ayrinhac',    'Samir Benhaicha',
];

let selectedName = null;
let mesVotes     = {};
let pendingVote  = {};
let nomsUtilises = [];

// ── Mot de passe ──────────────────────────────────────────────────────────────

async function checkMdp() {
  const input = document.getElementById('mdp-input');
  const btn   = document.getElementById('btn-mdp');
  const err   = document.getElementById('mdp-error');

  btn.disabled = true;
  btn.textContent = '...';

  const { data: ok, error } = await sb.rpc('verify_mdp_ca', { mdp: input.value });

  btn.disabled = false;
  btn.textContent = 'Accéder →';

  if (error) { showToast('Erreur serveur : ' + error.message); return; }

  if (ok === true) {
    sessionStorage.setItem('ca_auth', '1');
    document.getElementById('mdp-section').style.display    = 'none';
    document.getElementById('choice-section').style.display = 'block';
    await loadNomsUtilises();
    renderNameGrid();
  } else {
    err.style.display = 'block';
    input.value = '';
    input.focus();
    setTimeout(() => { err.style.display = 'none'; }, 2500);
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  if (sessionStorage.getItem('ca_auth') === '1') {
    document.getElementById('mdp-section').style.display    = 'none';
    document.getElementById('choice-section').style.display = 'block';
    await loadNomsUtilises();
    renderNameGrid();
  } else {
    document.getElementById('mdp-input').focus();
  }
});

// ── Navigation principale ─────────────────────────────────────────────────────

function goVoter() {
  hide('choice-section');
  show('name-section');
}

function goDocs() {
  hide('choice-section');
  show('docs-section');
  loadDocs();
}

function backToChoice() {
  hide('vote-section');
  hide('name-section');
  hide('docs-section');
  show('choice-section');
  selectedName = null;
  mesVotes = {};
  pendingVote = {};
  document.querySelectorAll('.name-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('btn-confirm-name').disabled = true;
}

function show(id) { document.getElementById(id).style.display = 'block'; }
function hide(id) { document.getElementById(id).style.display = 'none'; }

// ── Noms utilisés ─────────────────────────────────────────────────────────────

async function loadNomsUtilises() {
  const session = await getActiveSession('CA');
  if (!session) return;
  const { data: res } = await sb.from('resolutions').select('id').eq('session_id', session.id);
  if (!res?.length) return;
  const { data: votes } = await sb.from('votes').select('votant_email').in('resolution_id', res.map(r => r.id));
  nomsUtilises = [...new Set((votes || []).map(v => v.votant_email))];
}

// ── Sélection nom ─────────────────────────────────────────────────────────────

function renderNameGrid() {
  const grid = document.getElementById('name-grid');
  grid.innerHTML = MEMBRES_CA.map(nom => {
    const used    = nomsUtilises.includes(nom);
    const safeNom = nom.replace(/'/g, "\\'");
    return '<button class="name-btn ' + (used ? 'used' : '') + '" '
      + (used ? 'disabled' : 'onclick="selectName(this, \'' + safeNom + '\')"')
      + '>' + nom + (used ? ' ✓' : '') + '</button>';
  }).join('');
}

function selectName(el, nom) {
  selectedName = nom;
  document.querySelectorAll('.name-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('btn-confirm-name').disabled = false;
}

async function confirmName() {
  if (!selectedName) return;
  hide('name-section');
  show('vote-section');
  document.getElementById('voter-name-display').textContent = selectedName;
  await loadResolutions();
}

// ── Sessions ──────────────────────────────────────────────────────────────────

async function getActiveSession(type) {
  const { data } = await sb
    .from('sessions').select('*').eq('type', type)
    .order('created_at', { ascending: false }).limit(1);
  return data?.[0] || null;
}

// ── Vote ──────────────────────────────────────────────────────────────────────

async function loadResolutions() {
  const session = await getActiveSession('CA');
  if (!session) {
    document.getElementById('res-list').innerHTML =
      '<div class="empty-state"><h3>Aucune session active</h3><p>L\'administrateur doit créer une session CA.</p></div>';
    return;
  }

  const { data: resolutions } = await sb
    .from('resolutions').select('*').eq('session_id', session.id).order('numero');

  if (!resolutions?.length) {
    document.getElementById('res-list').innerHTML =
      '<div class="empty-state"><h3>Aucune résolution</h3><p>Aucune résolution n\'a encore été ajoutée.</p></div>';
    return;
  }

  const resIds = resolutions.map(r => r.id);
  const { data: votes } = await sb
    .from('votes').select('resolution_id, choix')
    .in('resolution_id', resIds).eq('votant_email', selectedName);

  mesVotes = {};
  (votes || []).forEach(v => { mesVotes[v.resolution_id] = v.choix; });
  renderResolutions(resolutions);
}

function renderResolutions(list) {
  document.getElementById('res-list').innerHTML = list.map(renderCard).join('');
}

function renderCard(r) {
  const dejaVote = mesVotes[r.id];
  const isOpen   = r.statut === 'ouverte';
  const labels   = { pour: '✅ Pour', contre: '❌ Contre', abstention: '⚪ Abstention' };

  let body = '';
  if (dejaVote) {
    body = '<span class="voted-tag ' + dejaVote + '">' + labels[dejaVote] + '</span>'
         + '<p style="font-size:0.78rem;color:#4a5568;margin-top:8px;">Vote enregistré</p>';
  } else if (isOpen) {
    body = '<div class="vote-row">'
      + '<button class="vbtn pour"       onclick="selectVote(\'' + r.id + '\',\'pour\',this)">✅ Pour</button>'
      + '<button class="vbtn contre"     onclick="selectVote(\'' + r.id + '\',\'contre\',this)">❌ Contre</button>'
      + '<button class="vbtn abstention" onclick="selectVote(\'' + r.id + '\',\'abstention\',this)">⚪ Abstention</button>'
      + '</div>'
      + '<div class="confirm-row" id="confirm-' + r.id + '">'
      + '<button class="btn-ok"     onclick="confirmVote(\'' + r.id + '\')">Confirmer</button>'
      + '<button class="btn-cancel" onclick="cancelVote(\'' + r.id + '\')">Annuler</button>'
      + '</div>';
  } else {
    body = '<span class="closed-label">Vote fermé pour cette résolution</span>';
  }

  return '<div class="res-card ' + (dejaVote ? 'voted' : '') + '" id="card-' + r.id + '">'
    + '<div class="res-num">Résolution n°' + r.numero + '</div>'
    + '<div class="res-titre">' + r.titre + '</div>'
    + (r.description ? '<div class="res-desc">' + r.description + '</div>' : '')
    + body + '</div>';
}

function selectVote(resId, choix, btn) {
  pendingVote[resId] = choix;
  const card = document.getElementById('card-' + resId);
  card.querySelectorAll('.vbtn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  document.getElementById('confirm-' + resId).classList.add('show');
}

function cancelVote(resId) {
  delete pendingVote[resId];
  const card = document.getElementById('card-' + resId);
  card.querySelectorAll('.vbtn').forEach(b => b.classList.remove('sel'));
  document.getElementById('confirm-' + resId).classList.remove('show');
}

async function confirmVote(resId) {
  const choix = pendingVote[resId];
  if (!choix) return;

  const { error } = await sb.from('votes').insert({
    resolution_id: resId, votant_email: selectedName, choix,
  });

  if (error) {
    showToast(error.code === '23505' ? 'Vous avez déjà voté' : 'Erreur : ' + error.message);
    return;
  }

  mesVotes[resId] = choix;
  delete pendingVote[resId];
  showToast('Vote enregistré ✅');

  const labels = { pour: '✅ Pour', contre: '❌ Contre', abstention: '⚪ Abstention' };
  const card   = document.getElementById('card-' + resId);
  card.classList.add('voted');
  card.querySelector('.vote-row')?.remove();
  card.querySelector('.confirm-row')?.remove();
  card.insertAdjacentHTML('beforeend',
    '<span class="voted-tag ' + choix + '">' + labels[choix] + '</span>'
    + '<p style="font-size:0.78rem;color:#4a5568;margin-top:8px;">Vote enregistré</p>');
}

// ── Documents ─────────────────────────────────────────────────────────────────

function switchTab(tab, btn) {
  document.querySelectorAll('.doc-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.doc-panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('panel-' + tab).classList.add('active');
}

async function loadDocs() {
  const { data: docs } = await sb.from('documents').select('*').order('created_at', { ascending: false });
  const all = docs || [];

  // Règlement intérieur
  const reglements = all.filter(d => d.type === 'reglement');
  document.getElementById('reglement-list').innerHTML = reglements.length
    ? reglements.map(d => docCard(d, '📋')).join('')
    : '<div class="empty-state"><h3>Aucun document</h3><p>Le règlement intérieur n\'a pas encore été mis en ligne.</p></div>';

  // PV CA
  const pvs = all.filter(d => d.type === 'pv');
  document.getElementById('pv-list').innerHTML = pvs.length
    ? pvs.map(d => docCard(d, '📝')).join('')
    : '<div class="empty-state"><h3>Aucun PV</h3><p>Les PV des conseils d\'administration apparaîtront ici.</p></div>';

  // Chronologie
  await loadChronologie();
}

function docCard(d, icon) {
  return '<a href="' + d.url + '" target="_blank" class="doc-card">'
    + '<div class="doc-icon">' + icon + '</div>'
    + '<div class="doc-info"><h4>' + d.titre + '</h4>'
    + '<p>' + (d.created_at ? new Date(d.created_at).toLocaleDateString('fr-FR', { dateStyle: 'long' }) : '') + '</p></div>'
    + '<span style="color:#C8A84B;font-size:1.2rem;margin-left:auto;">↗</span>'
    + '</a>';
}

async function loadChronologie() {
  // Toutes les sessions CA fermées avec leurs résolutions et votes
  const { data: sessions } = await sb
    .from('sessions').select('*').eq('type', 'CA').eq('statut', 'fermee')
    .order('created_at', { ascending: false });

  if (!sessions?.length) {
    document.getElementById('chrono-list').innerHTML =
      '<div class="empty-state"><h3>Aucune décision enregistrée</h3><p>L\'historique apparaîtra ici après la clôture des sessions.</p></div>';
    return;
  }

  let html = '';
  for (const session of sessions) {
    const { data: resolutions } = await sb
      .from('resolutions').select('*').eq('session_id', session.id).order('numero');
    if (!resolutions?.length) continue;

    const resIds = resolutions.map(r => r.id);
    const { data: votes } = await sb.from('votes').select('resolution_id, choix').in('resolution_id', resIds);

    const counts = {};
    resIds.forEach(id => { counts[id] = { pour: 0, contre: 0, abstention: 0, total: 0 }; });
    (votes || []).forEach(v => {
      if (counts[v.resolution_id]) { counts[v.resolution_id][v.choix]++; counts[v.resolution_id].total++; }
    });

    const date = new Date(session.created_at).toLocaleDateString('fr-FR', { dateStyle: 'long' });

    html += '<div class="chrono-session">'
      + '<div class="chrono-header">'
      + '<div><div class="chrono-date">📅 ' + date + '</div><div class="chrono-titre">' + session.titre + '</div></div>'
      + '<span style="color:#8fa8c8;font-size:0.8rem;">' + resolutions.length + ' décision' + (resolutions.length > 1 ? 's' : '') + '</span>'
      + '</div>'
      + '<div class="chrono-res">'
      + resolutions.map(r => {
          const c = counts[r.id];
          let pill = '';
          const exprimes = c.pour + c.contre;
          if (exprimes > 0) {
            const adopte = (c.pour / exprimes) >= (2/3);
            if (adopte) pill = '<span class="result-pill result-adopte">Adopté ' + c.pour + '/' + exprimes + ' (2/3)</span>';
            else        pill = '<span class="result-pill result-rejete">Rejeté ' + c.pour + '/' + exprimes + ' (2/3)</span>';
          }
          return '<div class="chrono-item">'
            + '<span class="chrono-item-titre">Rés. ' + r.numero + ' — ' + r.titre + '</span>'
            + pill + '</div>';
        }).join('')
      + '</div></div>';
  }

  document.getElementById('chrono-list').innerHTML = html || '<div class="empty-state"><h3>Aucune session clôturée</h3></div>';
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}
