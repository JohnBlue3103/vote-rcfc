let currentUser = null;
let mesVotes = {};       // resolution_id -> choix
let pendingVote = {};    // resolution_id -> choix en attente de confirmation

// ── Auth ──────────────────────────────────────────────────────────────────────

async function sendMagicLink() {
  const email = document.getElementById('email-input').value.trim();
  if (!email) return showToast('Entrez votre email');

  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href }
  });

  if (error) return showToast('Erreur : ' + error.message);
  document.getElementById('auth-msg').textContent = '✅ Lien envoyé ! Vérifiez votre boîte mail.';
}

async function logout() {
  await sb.auth.signOut();
  location.reload();
}

// ── Init ──────────────────────────────────────────────────────────────────────

sb.auth.onAuthStateChange(async (event, session) => {
  if (session?.user) {
    currentUser = session.user;
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('vote-section').style.display = 'block';
    document.getElementById('user-email').textContent = currentUser.email;
    await loadActiveSession();
  }
});

// Vérif session au chargement (retour depuis magic link)
sb.auth.getSession().then(({ data: { session } }) => {
  if (session?.user) {
    currentUser = session.user;
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('vote-section').style.display = 'block';
    document.getElementById('user-email').textContent = currentUser.email;
    loadActiveSession();
  }
});

// ── Chargement ────────────────────────────────────────────────────────────────

async function loadActiveSession() {
  // On prend la session la plus récente (ouverte ou fermée)
  const { data: sessions } = await sb
    .from('sessions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1);

  if (!sessions?.length) {
    document.getElementById('resolutions-list').innerHTML =
      '<div class="empty-state"><h3>Aucune session de vote disponible</h3><p>Contactez l\'administrateur.</p></div>';
    return;
  }

  const session = sessions[0];
  renderSessionInfo(session);
  await loadResolutions(session.id);
}

function renderSessionInfo(session) {
  const el = document.getElementById('session-info');
  el.style.display = 'flex';
  document.getElementById('session-titre').textContent = session.titre;
  document.getElementById('session-type').textContent = session.type;
  const badge = document.getElementById('session-badge');
  if (session.statut === 'ouverte') {
    badge.textContent = 'Vote ouvert';
    badge.className = 'badge badge-open';
  } else {
    badge.textContent = 'Vote fermé';
    badge.className = 'badge badge-closed';
  }
}

async function loadResolutions(sessionId) {
  const { data: resolutions } = await sb
    .from('resolutions')
    .select('*')
    .eq('session_id', sessionId)
    .order('numero');

  if (!resolutions?.length) {
    document.getElementById('resolutions-list').innerHTML =
      '<div class="empty-state"><h3>Aucune résolution</h3><p>Les résolutions apparaîtront ici.</p></div>';
    return;
  }

  // Récupère mes votes pour cette session
  const resIds = resolutions.map(r => r.id);
  const { data: votes } = await sb
    .from('votes')
    .select('resolution_id, choix')
    .in('resolution_id', resIds);

  mesVotes = {};
  (votes || []).forEach(v => { mesVotes[v.resolution_id] = v.choix; });

  renderResolutions(resolutions);
}

// ── Render ────────────────────────────────────────────────────────────────────

function renderResolutions(resolutions) {
  const container = document.getElementById('resolutions-list');
  container.innerHTML = resolutions.map(r => renderCard(r)).join('');
}

function renderCard(r) {
  const dejaVote = mesVotes[r.id];
  const isOpen   = r.statut === 'ouverte';

  let statusClass = isOpen ? 'open' : 'closed';
  if (dejaVote) statusClass = 'voted';

  let body = '';

  if (dejaVote) {
    body = `<span class="voted-label voted-${dejaVote}">
      ${{ pour: '✅ Pour', contre: '❌ Contre', abstention: '⚪ Abstention' }[dejaVote]}
    </span>
    <p style="font-size:0.82rem;color:#888;margin-top:8px;">Vote enregistré</p>`;
  } else if (isOpen) {
    body = `
    <div class="vote-buttons">
      <button class="vote-btn pour"        onclick="selectVote('${r.id}','pour')">✅ Pour</button>
      <button class="vote-btn contre"      onclick="selectVote('${r.id}','contre')">❌ Contre</button>
      <button class="vote-btn abstention"  onclick="selectVote('${r.id}','abstention')">⚪ Abstention</button>
    </div>
    <div class="vote-confirm" id="confirm-${r.id}">
      <button class="btn btn-success btn-sm" onclick="confirmVote('${r.id}')">Confirmer mon vote</button>
      <button class="btn btn-outline btn-sm" onclick="cancelVote('${r.id}')">Annuler</button>
    </div>`;
  } else {
    body = `<p style="color:#a0aec0;font-size:0.9rem;">Vote fermé pour cette résolution.</p>`;
  }

  return `
  <div class="resolution-card ${statusClass}" id="card-${r.id}">
    <div class="res-header">
      <div>
        <div class="res-numero">Résolution n°${r.numero}</div>
        <div class="res-titre">${r.titre}</div>
      </div>
      <span class="badge ${isOpen ? 'badge-open' : 'badge-closed'}">${isOpen ? 'Ouvert' : 'Fermé'}</span>
    </div>
    ${r.description ? `<div class="res-desc">${r.description}</div>` : ''}
    ${body}
  </div>`;
}

// ── Vote ──────────────────────────────────────────────────────────────────────

function selectVote(resId, choix) {
  pendingVote[resId] = choix;

  // Highlight le bouton sélectionné
  const card = document.getElementById('card-' + resId);
  card.querySelectorAll('.vote-btn').forEach(btn => btn.classList.remove('active'));
  card.querySelector(`.vote-btn.${choix}`)?.classList.add('active');

  // Affiche les boutons de confirmation
  document.getElementById('confirm-' + resId)?.classList.add('show');
}

function cancelVote(resId) {
  delete pendingVote[resId];
  const card = document.getElementById('card-' + resId);
  card.querySelectorAll('.vote-btn').forEach(btn => btn.classList.remove('active'));
  document.getElementById('confirm-' + resId)?.classList.remove('show');
}

async function confirmVote(resId) {
  const choix = pendingVote[resId];
  if (!choix) return;

  const { error } = await sb.from('votes').insert({
    resolution_id: resId,
    votant_email: currentUser.email,
    choix,
  });

  if (error) {
    showToast(error.code === '23505' ? 'Vous avez déjà voté pour cette résolution' : 'Erreur : ' + error.message);
    return;
  }

  mesVotes[resId] = choix;
  delete pendingVote[resId];

  // Re-render uniquement cette carte
  const res = { id: resId };
  // Rafraîchit proprement via reload des résolutions
  showToast('Vote enregistré ✅');
  location.reload();
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}
