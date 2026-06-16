let mesVotesAg  = {};
let pendingVoteAg = {};

// ── Mot de passe ──────────────────────────────────────────────────────────────

async function checkMdpAg() {
  const input = document.getElementById('mdp-input');
  const btn   = document.getElementById('btn-mdp');
  const err   = document.getElementById('mdp-error');

  btn.disabled    = true;
  btn.textContent = '...';

  const { data: ok, error } = await sb.rpc('verify_mdp_ag', { mdp: input.value });

  btn.disabled    = false;
  btn.textContent = 'Accéder →';

  if (error) { showToast('Erreur serveur : ' + error.message); return; }

  if (ok === true) {
    sessionStorage.setItem('ag_auth', '1');
    document.getElementById('mdp-section').style.display    = 'none';
    document.getElementById('choice-section').style.display = 'block';
  } else {
    err.style.display = 'block';
    input.value = '';
    input.focus();
    setTimeout(() => { err.style.display = 'none'; }, 2500);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('ag_auth') === '1') {
    document.getElementById('mdp-section').style.display    = 'none';
    document.getElementById('choice-section').style.display = 'block';
  } else {
    document.getElementById('mdp-input').focus();
  }
});

// ── Identifiant anonyme (anti double-vote par appareil) ───────────────────────

function getVoterId() {
  let id = sessionStorage.getItem('ag_voter_id');
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID()
       : Math.random().toString(36).slice(2) + Date.now().toString(36);
    sessionStorage.setItem('ag_voter_id', id);
  }
  return id;
}

// ── Navigation ────────────────────────────────────────────────────────────────

function goVoter() {
  hide('choice-section');
  show('vote-section');
  loadResolutionsAg();
}

function goChrono() {
  hide('choice-section');
  show('chrono-section');
  loadChronologieAg();
}

function backToChoice() {
  hide('vote-section');
  hide('chrono-section');
  show('choice-section');
  mesVotesAg    = {};
  pendingVoteAg = {};
}

function show(id) { document.getElementById(id).style.display = 'block'; }
function hide(id) { document.getElementById(id).style.display = 'none'; }

// ── Règles de majorité (statuts RCFC) ─────────────────────────────────────────
// Art.12 : majorité simple (pour > contre)
// Art.14 : 2/3 des exprimés pour modification des statuts
// Art.15 : 3/4 des exprimés pour dissolution

const TYPE_LABELS = {
  ordinaire:   'Majorité simple',
  statuts:     'Majorité 2/3 (modification statuts)',
  dissolution: 'Majorité 3/4 (dissolution)',
};

function computeResult(c, typeRes) {
  const exprimes = c.pour + c.contre;
  if (exprimes === 0) {
    return { adopte: null, pill: '<span class="result-pill" style="background:#2d3748;color:#8fa8c8;">Aucun vote exprimé</span>' };
  }

  let adopte, texte;
  if (typeRes === 'dissolution') {
    adopte = (c.pour / exprimes) >= (3 / 4);
    texte  = 'aux 3/4 — ' + c.pour + '/' + exprimes;
  } else if (typeRes === 'statuts') {
    adopte = (c.pour / exprimes) >= (2 / 3);
    texte  = 'aux 2/3 — ' + c.pour + '/' + exprimes;
  } else {
    // majorité simple : pour > contre
    adopte = c.pour > c.contre;
    texte  = c.pour + ' Pour / ' + c.contre + ' Contre';
  }

  const pill = adopte
    ? '<span class="result-pill result-adopte">Adopté ' + texte + '</span>'
    : '<span class="result-pill result-rejete">Rejeté ' + texte + '</span>';

  return { adopte, pill };
}

// ── Chargement des résolutions ────────────────────────────────────────────────

async function loadResolutionsAg() {
  const { data: rows } = await sb
    .from('sessions').select('*').eq('type', 'AG')
    .order('created_at', { ascending: false }).limit(1);
  const session = rows?.[0];
  const listEl  = document.getElementById('ag-res-list');

  if (!session) {
    listEl.innerHTML = '<div class="empty-state"><h3>Aucune session AG active</h3>'
      + '<p>L\'administrateur doit créer une session AG.</p></div>';
    return;
  }

  const infoEl = document.getElementById('ag-session-info');
  infoEl.style.display = 'block';
  document.getElementById('ag-session-titre').textContent = session.titre;
  if (session.nombre_membres_presents) {
    document.getElementById('ag-session-presents').textContent =
      session.nombre_membres_presents + ' membres présents';
  }

  const { data: resolutions } = await sb
    .from('resolutions').select('*').eq('session_id', session.id).order('numero');

  if (!resolutions?.length) {
    listEl.innerHTML = '<div class="empty-state"><h3>Aucune résolution</h3>'
      + '<p>Aucune résolution n\'a encore été ajoutée.</p></div>';
    return;
  }

  const voterId = getVoterId();
  const resIds  = resolutions.map(r => r.id);
  const { data: votes } = await sb
    .from('votes').select('resolution_id, choix')
    .in('resolution_id', resIds).eq('votant_email', voterId);

  mesVotesAg = {};
  (votes || []).forEach(v => { mesVotesAg[v.resolution_id] = v.choix; });
  listEl.innerHTML = resolutions.map(renderCardAg).join('');
}

function renderCardAg(r) {
  const dejaVote = mesVotesAg[r.id];
  const isOpen   = r.statut === 'ouverte';
  const labels   = { pour: '✅ Pour', contre: '❌ Contre', abstention: '⚪ Abstention' };
  const typeRes  = r.type_resolution || 'ordinaire';
  const typeLabel = TYPE_LABELS[typeRes];

  let body = '';
  if (dejaVote) {
    body = '<span class="voted-tag ' + dejaVote + '">' + labels[dejaVote] + '</span>'
         + '<p style="font-size:0.78rem;color:#4a5568;margin-top:8px;">Vote enregistré</p>';
  } else if (isOpen) {
    body = '<div class="vote-row">'
      + '<button class="vbtn pour"       onclick="selectVoteAg(\'' + r.id + '\',\'pour\',this)">✅ Pour</button>'
      + '<button class="vbtn contre"     onclick="selectVoteAg(\'' + r.id + '\',\'contre\',this)">❌ Contre</button>'
      + '<button class="vbtn abstention" onclick="selectVoteAg(\'' + r.id + '\',\'abstention\',this)">⚪ Abstention</button>'
      + '</div>'
      + '<div class="confirm-row" id="confirm-' + r.id + '">'
      + '<button class="btn-ok"     onclick="confirmVoteAg(\'' + r.id + '\')">Confirmer</button>'
      + '<button class="btn-cancel" onclick="cancelVoteAg(\'' + r.id + '\')">Annuler</button>'
      + '</div>';
  } else {
    body = '<span class="closed-label">Vote fermé pour cette résolution</span>';
  }

  return '<div class="res-card ' + (dejaVote ? 'voted' : '') + '" id="card-' + r.id + '">'
    + '<div class="res-num">Résolution n°' + r.numero
    + ' <span class="type-badge">' + typeLabel + '</span></div>'
    + '<div class="res-titre">' + r.titre + '</div>'
    + (r.description ? '<div class="res-desc">' + r.description + '</div>' : '')
    + body + '</div>';
}

function selectVoteAg(resId, choix, btn) {
  pendingVoteAg[resId] = choix;
  const card = document.getElementById('card-' + resId);
  card.querySelectorAll('.vbtn').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  document.getElementById('confirm-' + resId).classList.add('show');
}

function cancelVoteAg(resId) {
  delete pendingVoteAg[resId];
  const card = document.getElementById('card-' + resId);
  card.querySelectorAll('.vbtn').forEach(b => b.classList.remove('sel'));
  document.getElementById('confirm-' + resId).classList.remove('show');
}

async function confirmVoteAg(resId) {
  const choix   = pendingVoteAg[resId];
  const voterId = getVoterId();
  if (!choix) return;

  const { error } = await sb.from('votes').insert({
    resolution_id: resId, votant_email: voterId, choix,
  });

  if (error) {
    showToast(error.code === '23505' ? 'Vous avez déjà voté pour cette résolution' : 'Erreur : ' + error.message);
    return;
  }

  mesVotesAg[resId] = choix;
  delete pendingVoteAg[resId];
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

// ── Récapitulatif ─────────────────────────────────────────────────────────────

async function loadChronologieAg() {
  const { data: sessions } = await sb
    .from('sessions').select('*').eq('type', 'AG').eq('statut', 'fermee')
    .order('created_at', { ascending: false });

  const listEl = document.getElementById('ag-chrono-list');

  if (!sessions?.length) {
    listEl.innerHTML = '<div class="empty-state"><h3>Aucune décision enregistrée</h3>'
      + '<p>L\'historique apparaîtra ici après la clôture des sessions.</p></div>';
    return;
  }

  let html = '';
  for (const session of sessions) {
    const { data: resolutions } = await sb
      .from('resolutions').select('*').eq('session_id', session.id).order('numero');
    if (!resolutions?.length) continue;

    const resIds = resolutions.map(r => r.id);
    const { data: votes } = await sb
      .from('votes').select('resolution_id, choix').in('resolution_id', resIds);

    const counts = {};
    resIds.forEach(id => { counts[id] = { pour: 0, contre: 0, abstention: 0, total: 0 }; });
    (votes || []).forEach(v => {
      if (counts[v.resolution_id]) { counts[v.resolution_id][v.choix]++; counts[v.resolution_id].total++; }
    });

    const date = new Date(session.created_at).toLocaleDateString('fr-FR', { dateStyle: 'long' });
    const total   = session.nombre_membres_total    || 0;
    const present = session.nombre_membres_presents || 0;

    // Infos quorum
    let quorumHtml = '';
    if (total && present) {
      const pct   = Math.round((present / total) * 100);
      const q14   = present >= Math.ceil(total / 4);
      const q12   = present > total / 2;
      quorumHtml = '<div style="padding:10px 20px;border-bottom:1px solid #1e3a5f22;font-size:0.78rem;color:#8fa8c8;display:flex;flex-wrap:wrap;gap:12px;">'
        + '<span>👥 ' + present + ' présents / ' + total + ' adhérents (' + pct + '%)</span>'
        + '<span style="color:' + (q14 ? '#48bb78' : '#fc8181') + '">Quorum statuts (1/4) : ' + (q14 ? '✅ atteint' : '❌ non atteint') + '</span>'
        + '<span style="color:' + (q12 ? '#48bb78' : '#fc8181') + '">Quorum dissolution (1/2) : ' + (q12 ? '✅ atteint' : '❌ non atteint') + '</span>'
        + '</div>';
    }

    html += '<div class="chrono-session">'
      + '<div class="chrono-header">'
      + '<div><div class="chrono-date">📅 ' + date + '</div><div class="chrono-titre">' + session.titre + '</div></div>'
      + '<span style="color:#8fa8c8;font-size:0.8rem;">' + resolutions.length + ' décision' + (resolutions.length > 1 ? 's' : '') + '</span>'
      + '</div>'
      + quorumHtml
      + '<div class="chrono-res">'
      + resolutions.map(r => {
          const c      = counts[r.id];
          const typeRes = r.type_resolution || 'ordinaire';
          const res    = computeResult(c, typeRes);
          return '<div class="chrono-item" style="flex-direction:column;align-items:flex-start;gap:6px;padding:10px 0;">'
            + '<div style="display:flex;justify-content:space-between;width:100%;align-items:center;gap:8px;">'
            + '<span class="chrono-item-titre">Rés. ' + r.numero + ' — ' + r.titre + '</span>'
            + res.pill + '</div>'
            + '<div style="font-size:0.75rem;color:#4a5568;">'
            + TYPE_LABELS[typeRes]
            + ' · ✅ ' + c.pour + ' Pour · ❌ ' + c.contre + ' Contre · ⚪ ' + c.abstention + ' Abstention'
            + ' · ' + c.total + ' votant' + (c.total > 1 ? 's' : '')
            + '</div>'
            + '</div>';
        }).join('')
      + '</div></div>';
  }

  listEl.innerHTML = html || '<div class="empty-state"><h3>Aucune session clôturée</h3></div>';
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}
