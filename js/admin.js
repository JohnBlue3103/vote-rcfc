let adminUser = null;
let sessions  = [];
let currentViewSession = null;

// ── Auth ──────────────────────────────────────────────────────────────────────

async function adminLogin() {
  const email = document.getElementById('admin-email').value.trim();
  if (!email) return showToast('Email requis');
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href }
  });
  if (error) return showToast('Erreur : ' + error.message);
  document.getElementById('admin-auth-msg').textContent = '✅ Lien envoyé ! Vérifiez votre mail.';
}

async function logout() {
  await sb.auth.signOut();
  location.reload();
}

// ── Init ──────────────────────────────────────────────────────────────────────

sb.auth.onAuthStateChange(async (event, session) => {
  if (session?.user) initAdmin(session.user);
});

sb.auth.getSession().then(({ data: { session } }) => {
  if (session?.user) initAdmin(session.user);
});

async function initAdmin(user) {
  adminUser = user;
  document.getElementById('admin-auth').style.display  = 'none';
  document.getElementById('admin-panel').style.display = 'block';
  document.getElementById('admin-user-email').textContent = user.email;
  await loadSessions();
}

async function loadSessions() {
  const { data } = await sb.from('sessions').select('*').order('created_at', { ascending: false });
  sessions = data || [];
  populateSessionSelects();
  if (sessions.length) loadAdminResolutions();
}

function populateSessionSelects() {
  const opts = sessions.map(s =>
    `<option value="${s.id}">[${s.type}] ${s.titre} — ${s.statut}</option>`
  ).join('');
  document.getElementById('r-session').innerHTML   = opts || '<option>— aucune session —</option>';
  document.getElementById('view-session').innerHTML = opts || '<option>— aucune session —</option>';
}

async function refreshAdmin() {
  await loadSessions();
  showToast('Actualisé');
}

// ── Sessions ──────────────────────────────────────────────────────────────────

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
  const sessionId = document.getElementById('view-session').value;
  if (!sessionId) return;
  const { error } = await sb.from('sessions').update({ statut }).eq('id', sessionId);
  if (error) return showToast('Erreur : ' + error.message);
  showToast(statut === 'ouverte' ? 'Session ouverte ✅' : 'Session fermée ✅');
  await loadSessions();
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
  document.getElementById('r-titre').value = '';
  document.getElementById('r-desc').value  = '';
  document.getElementById('r-numero').value = numero + 1;
  await loadAdminResolutions();
}

async function loadAdminResolutions() {
  const sessionId = document.getElementById('view-session').value;
  if (!sessionId) return;

  currentViewSession = sessions.find(s => s.id === sessionId);

  // Boutons ouvrir/fermer session
  const ctrl = document.getElementById('admin-session-controls');
  ctrl.style.display = 'flex';
  document.getElementById('btn-open-session').style.display =
    currentViewSession?.statut === 'fermee' ? 'inline-block' : 'none';
  document.getElementById('btn-close-session').style.display =
    currentViewSession?.statut === 'ouverte' ? 'inline-block' : 'none';

  const { data: resolutions } = await sb
    .from('resolutions')
    .select('*')
    .eq('session_id', sessionId)
    .order('numero');

  if (!resolutions?.length) {
    document.getElementById('admin-res-list').innerHTML =
      '<div class="empty-state"><p>Aucune résolution</p></div>';
    return;
  }

  // Compte les votes pour chaque résolution
  const resIds = resolutions.map(r => r.id);
  const { data: votes } = await sb
    .from('votes')
    .select('resolution_id, choix')
    .in('resolution_id', resIds);

  const voteCounts = {};
  resIds.forEach(id => { voteCounts[id] = { pour: 0, contre: 0, abstention: 0, total: 0 }; });
  (votes || []).forEach(v => {
    if (voteCounts[v.resolution_id]) {
      voteCounts[v.resolution_id][v.choix]++;
      voteCounts[v.resolution_id].total++;
    }
  });

  document.getElementById('admin-res-list').innerHTML =
    resolutions.map(r => renderAdminCard(r, voteCounts[r.id])).join('');
}

function renderAdminCard(r, counts) {
  const total = counts.total || 0;
  const pct = v => total ? Math.round((v / total) * 100) : 0;

  const barRow = (label, count, color) => `
    <div class="bar-row">
      <span class="bar-label">${label}</span>
      <div style="flex:1;background:#f0f4f8;border-radius:4px;height:8px;">
        <div class="bar-fill" style="width:${pct(count)}%;background:${color};"></div>
      </div>
      <span class="bar-count">${count}</span>
    </div>`;

  return `
  <div class="res-admin-card ${r.statut === 'ouverte' ? 'open' : ''}">
    <div style="flex:1;">
      <div style="font-size:0.78rem;color:#888;">Résolution n°${r.numero}</div>
      <div style="font-weight:700;margin:3px 0;">${r.titre}</div>
      <div class="results-bar" style="margin-top:10px;">
        ${barRow('✅ Pour',       counts.pour,       '#276749')}
        ${barRow('❌ Contre',     counts.contre,     '#e53e3e')}
        ${barRow('⚪ Abstention', counts.abstention, '#d69e2e')}
      </div>
      <div style="font-size:0.78rem;color:#888;margin-top:6px;">${total} vote${total>1?'s':''}</div>
    </div>
    <div class="res-actions">
      <span class="badge ${r.statut === 'ouverte' ? 'badge-open' : 'badge-closed'}">${r.statut}</span>
      ${r.statut === 'fermee'
        ? `<button class="btn btn-success btn-sm" onclick="toggleRes('${r.id}','ouverte')">Ouvrir</button>`
        : `<button class="btn btn-danger btn-sm"  onclick="toggleRes('${r.id}','fermee')">Fermer</button>`}
      <button class="btn btn-outline btn-sm" style="color:#e53e3e;border-color:#e53e3e;" onclick="deleteRes('${r.id}')">Suppr.</button>
    </div>
  </div>`;
}

async function toggleRes(resId, statut) {
  await sb.from('resolutions').update({ statut }).eq('id', resId);
  await loadAdminResolutions();
}

async function deleteRes(resId) {
  if (!confirm('Supprimer cette résolution et tous ses votes ?')) return;
  await sb.from('resolutions').delete().eq('id', resId);
  showToast('Résolution supprimée');
  await loadAdminResolutions();
}

// ── Toast ─────────────────────────────────────────────────────────────────────

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}
