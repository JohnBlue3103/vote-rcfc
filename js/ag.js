let selectedCodeAg = null;
let selectedIdAg   = null;
let mesVotesAg     = {};
let pendingVoteAg  = {};
let chronoLoaded   = false;

// ── Code adhérent ─────────────────────────────────────────────────────────────

async function verifyCodeAg() {
  const input = document.getElementById('code-input');
  const btn   = document.getElementById('btn-code');
  const err   = document.getElementById('code-error');
  const code  = input.value.trim().toUpperCase();
  if (!code) return;

  btn.disabled    = true;
  btn.textContent = '...';

  const { data, error } = await sb.rpc('verify_code_ag', { p_code: code });

  btn.disabled    = false;
  btn.textContent = 'Accéder →';

  if (error || !data?.ok) {
    err.style.display = 'block';
    input.value = '';
    input.focus();
    setTimeout(() => { err.style.display = 'none'; }, 3000);
    return;
  }

  selectedCodeAg = code;
  selectedIdAg   = data.id;
  sessionStorage.setItem('ag_auth_code', code);
  sessionStorage.setItem('ag_auth_id',   data.id);
  sessionStorage.setItem('ag_auth_nom',  data.nom);
  showMainSection(data.nom);
}

window.addEventListener('DOMContentLoaded', () => {
  const savedCode = sessionStorage.getItem('ag_auth_code');
  const savedId   = sessionStorage.getItem('ag_auth_id');
  const savedNom  = sessionStorage.getItem('ag_auth_nom');
  if (savedCode && savedId && savedNom) {
    selectedCodeAg = savedCode;
    selectedIdAg   = savedId;
    showMainSection(savedNom);
  } else {
    document.getElementById('code-input').focus();
  }
});

function showMainSection(nom) {
  document.getElementById('code-section').style.display = 'none';
  document.getElementById('main-section').style.display = 'block';
  document.getElementById('ag-membre-nom').textContent  = nom;
  switchAgTab('vote');
  lucide.createIcons();
}

function logoutAg() {
  sessionStorage.removeItem('ag_auth_code');
  sessionStorage.removeItem('ag_auth_id');
  sessionStorage.removeItem('ag_auth_nom');
  selectedCodeAg = null;
  selectedIdAg   = null;
  mesVotesAg     = {};
  pendingVoteAg  = {};
  chronoLoaded   = false;
  document.getElementById('main-section').style.display = 'none';
  document.getElementById('code-section').style.display = 'block';
  document.getElementById('code-input').value = '';
  document.getElementById('code-input').focus();
}

// ── Onglets ───────────────────────────────────────────────────────────────────

function switchAgTab(tab) {
  document.getElementById('panel-docs').style.display = tab === 'docs' ? 'block' : 'none';
  document.getElementById('panel-vote').style.display = tab === 'vote' ? 'block' : 'none';
  document.getElementById('tab-docs').classList.toggle('active', tab === 'docs');
  document.getElementById('tab-vote').classList.toggle('active', tab === 'vote');
  if (tab === 'docs') loadDocsAg();
  if (tab === 'vote') loadResolutionsAg();
}

// ── Documents ─────────────────────────────────────────────────────────────────

async function loadDocsAg() {
  const listEl = document.getElementById('ag-docs-list');
  const { data: docs } = await sb.from('documents').select('*')
    .in('type', ['reglement_ag', 'pv_ag']).order('created_at', { ascending: false });

  if (!docs?.length) {
    listEl.innerHTML = '<div class="empty-state"><h3>Aucun document</h3><p>Les documents seront mis en ligne par l\'administrateur.</p></div>';
    return;
  }

  listEl.innerHTML = docs.map(d => {
    const icon = d.type === 'reglement' ? '📋' : '📝';
    const date = d.created_at ? new Date(d.created_at).toLocaleDateString('fr-FR', { dateStyle: 'long' }) : '';
    return '<a href="' + d.url + '" target="_blank" class="doc-card">'
      + '<div class="doc-icon">' + icon + '</div>'
      + '<div class="doc-info"><h4>' + d.titre + '</h4><p>' + date + '</p></div>'
      + '<span style="color:#C8A84B;font-size:1.2rem;margin-left:auto;">↗</span>'
      + '</a>';
  }).join('');
}

// ── Règles de majorité ────────────────────────────────────────────────────────

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
    adopte = c.pour > c.contre;
    texte  = c.pour + ' Pour / ' + c.contre + ' Contre';
  }

  const pill = adopte
    ? '<span class="result-pill result-adopte">Adopté ' + texte + '</span>'
    : '<span class="result-pill result-rejete">Rejeté ' + texte + '</span>';

  return { adopte, pill };
}

// ── Vote ──────────────────────────────────────────────────────────────────────

async function loadResolutionsAg() {
  const { data: rows } = await sb
    .from('sessions').select('*').eq('type', 'AG')
    .order('created_at', { ascending: false }).limit(1);
  const session = rows?.[0];
  const listEl  = document.getElementById('ag-res-list');

  if (!session) {
    listEl.innerHTML = '<div class="empty-state"><h3>Aucune session AG</h3><p>L\'administrateur doit créer une session AG.</p></div>';
    return;
  }

  const barEl = document.getElementById('ag-session-bar');
  barEl.style.display = 'block';
  document.getElementById('ag-session-titre').textContent = session.titre;
  if (session.nombre_membres_presents) {
    document.getElementById('ag-session-presents').textContent =
      session.nombre_membres_presents + ' membres présents';
  }

  const { data: resolutions } = await sb
    .from('resolutions').select('*').eq('session_id', session.id).order('numero');

  if (!resolutions?.length) {
    listEl.innerHTML = '<div class="empty-state"><h3>Aucune résolution</h3><p>Aucune résolution n\'a encore été ajoutée.</p></div>';
    return;
  }

  const resIds = resolutions.map(r => r.id);

  const { data: votedIds } = await sb.rpc('check_voted_ag', {
    p_resolution_ids: resIds,
    p_membre_id:      selectedIdAg,
  });

  mesVotesAg = {};
  (votedIds || []).forEach(id => { mesVotesAg[id] = true; });
  listEl.innerHTML = resolutions.map(renderCardAg).join('');
}

function renderCardAg(r) {
  const dejaVote  = !!mesVotesAg[r.id];
  const isOpen    = r.statut === 'ouverte';
  const typeRes   = r.type_resolution || 'ordinaire';
  const typeLabel = TYPE_LABELS[typeRes];

  let body = '';
  if (dejaVote) {
    body = '<span class="voted-tag voted">✓ Vote enregistré</span>'
         + '<p style="font-size:0.78rem;color:#4a5568;margin-top:8px;">Votre vote est anonyme</p>';
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
  const choix = pendingVoteAg[resId];
  if (!choix) return;

  const { data: result, error } = await sb.rpc('cast_vote_ag', {
    p_resolution_id: resId,
    p_membre_id:     selectedIdAg,
    p_choix:         choix,
  });

  if (error || !result?.ok) {
    const msg = result?.error === 'already_voted' ? 'Vous avez déjà voté pour cette résolution' : 'Erreur : ' + (result?.error || error?.message);
    showToast(msg);
    return;
  }

  mesVotesAg[resId] = true;
  delete pendingVoteAg[resId];
  showToast('Vote enregistré ✅');

  const card = document.getElementById('card-' + resId);
  card.classList.add('voted');
  card.querySelector('.vote-row')?.remove();
  card.querySelector('.confirm-row')?.remove();
  card.insertAdjacentHTML('beforeend',
    '<span class="voted-tag voted">✓ Vote enregistré</span>'
    + '<p style="font-size:0.78rem;color:#4a5568;margin-top:8px;">Votre vote est anonyme</p>');
}

// ── Récapitulatif ─────────────────────────────────────────────────────────────

function toggleChrono(btn) {
  const wrap = document.getElementById('ag-chrono-wrap');
  const chevron = document.getElementById('chrono-chevron');
  const isOpen  = wrap.style.display !== 'none';

  wrap.style.display = isOpen ? 'none' : 'block';
  chevron.setAttribute('data-lucide', isOpen ? 'chevron-down' : 'chevron-up');
  lucide.createIcons();

  if (!isOpen && !chronoLoaded) {
    chronoLoaded = true;
    loadChronologieAg();
  }
}

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

    const date    = new Date(session.created_at).toLocaleDateString('fr-FR', { dateStyle: 'long' });
    const present = session.nombre_membres_presents || 0;
    const presentsHtml = present
      ? '<div style="padding:10px 20px;border-bottom:1px solid #1e3a5f22;font-size:0.78rem;color:#8fa8c8;">👥 ' + present + ' membre' + (present > 1 ? 's' : '') + ' présent' + (present > 1 ? 's' : '') + '</div>'
      : '';

    html += '<div class="chrono-session">'
      + '<div class="chrono-header">'
      + '<div><div class="chrono-date">📅 ' + date + '</div><div class="chrono-titre">' + session.titre + '</div></div>'
      + '<span style="color:#8fa8c8;font-size:0.8rem;">' + resolutions.length + ' décision' + (resolutions.length > 1 ? 's' : '') + '</span>'
      + '</div>'
      + presentsHtml
      + '<div class="chrono-res">'
      + resolutions.map(r => {
          const online    = counts[r.id];
          const hasManuel = r.votes_pour_manuel !== null && r.votes_pour_manuel !== undefined;
          const c         = hasManuel
            ? { pour: r.votes_pour_manuel, contre: r.votes_contre_manuel, abstention: r.votes_abstention_manuel, total: r.votes_pour_manuel + r.votes_contre_manuel + r.votes_abstention_manuel }
            : { ...online };
          const typeRes   = r.type_resolution || 'ordinaire';
          const res       = computeResult(c, typeRes);
          const modeLabel = hasManuel ? ' <span style="background:#1a3260;border-radius:4px;padding:1px 6px;font-size:0.68rem;color:#8fa8c8;">présentiel</span>' : '';
          return '<div class="chrono-item">'
            + '<div style="display:flex;justify-content:space-between;width:100%;align-items:center;gap:8px;">'
            + '<span class="chrono-item-titre">Rés. ' + r.numero + ' — ' + r.titre + modeLabel + '</span>'
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
