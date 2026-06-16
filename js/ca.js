const MEMBRES_CA = [
  'John Bernard',    'Aderito Miranda',    'Gireg Rannou',      'Didier Mercadal',
  'Romain Hochedez', 'Alexandre Ruiz',     'Karim Hajjaji',     'Emmanuel Martinez',
  'Laurent Laborde', 'Tiffany Duclos',     'Laurent Cohen',     'Nicolas Broueilh',
  'Joël Chiche',     'Brice Mamode',       'Yohan Ayrinhac',    'Samir Benhaicha',
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
  const val   = input.value;

  btn.disabled    = true;
  btn.textContent = '...';

  const { data: ok, error } = await sb.rpc('verify_mdp_ca', { mdp: val });

  btn.disabled    = false;
  btn.textContent = 'Accéder →';

  if (error) {
    console.error('RPC error:', error);
    showToast('Erreur serveur : ' + error.message);
    return;
  }

  if (ok === true) {
    document.getElementById('mdp-section').style.display  = 'none';
    document.getElementById('name-section').style.display = 'block';
  } else {
    err.style.display = 'block';
    input.value = '';
    input.focus();
    setTimeout(() => { err.style.display = 'none'; }, 2500);
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', async () => {
  await loadNomsUtilises();
  renderNameGrid();
  document.getElementById('mdp-input').focus();
});

async function loadNomsUtilises() {
  const session = await getActiveSession('CA');
  if (!session) return;
  const { data: resolutions } = await sb.from('resolutions').select('id').eq('session_id', session.id);
  if (!resolutions?.length) return;
  const resIds = resolutions.map(r => r.id);
  const { data: votes } = await sb.from('votes').select('votant_email').in('resolution_id', resIds);
  nomsUtilises = [...new Set((votes || []).map(v => v.votant_email))];
}

// ── Sélection du nom ──────────────────────────────────────────────────────────

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
  document.getElementById('name-section').style.display = 'none';
  document.getElementById('vote-section').style.display = 'block';
  document.getElementById('voter-name-display').textContent = selectedName;
  await loadResolutions();
}

function changeName() {
  selectedName = null;
  mesVotes    = {};
  pendingVote = {};
  document.getElementById('vote-section').style.display = 'none';
  document.getElementById('name-section').style.display = 'block';
  document.getElementById('btn-confirm-name').disabled  = true;
  document.querySelectorAll('.name-btn').forEach(b => b.classList.remove('active'));
}

// ── Sessions & Résolutions ────────────────────────────────────────────────────

async function getActiveSession(type) {
  const { data } = await sb
    .from('sessions').select('*').eq('type', type)
    .order('created_at', { ascending: false }).limit(1);
  return data?.[0] || null;
}

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
      '<div class="empty-state"><h3>Aucune résolution</h3><p>L\'administrateur n\'a pas encore ajouté de résolutions.</p></div>';
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

// ── Render ────────────────────────────────────────────────────────────────────

function renderResolutions(resolutions) {
  document.getElementById('res-list').innerHTML = resolutions.map(renderCard).join('');
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
    + body
    + '</div>';
}

// ── Vote ──────────────────────────────────────────────────────────────────────

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
    resolution_id: resId,
    votant_email:  selectedName,
    choix,
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

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}
