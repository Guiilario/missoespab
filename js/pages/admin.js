import { auth, signInWithEmailAndPassword, signOut, createUserAsAdmin } from "../firebase.js";
import {
  checkIsAdmin,
  createUserProfile,
  subscribeToAllUsers,
  setUserDisabled,
  subscribeToAllMissions,
  createMission,
  assignMissionToDate,
  removeMissionFromDate,
  subscribeToAssignmentForDate,
  subscribeToMission,
  subscribeToRanking,
  todayKey,
  getMissionLogsForUser,
} from "../firestore.js";

// Não renderiza a nav global — o admin tem sua própria UI

let currentUser = null;
let allMissionsCatalog = [];
let allUsersCache = [];
let assignmentUnsub = null;
let activeMissionsUnsub = null;
let missionDetailUnsubs = [];
let activeMissionDetailUnsubs = [];

// ---------- Tab system ----------
document.getElementById("admin-tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".admin-tab");
  if (!btn) return;

  const target = btn.dataset.tab;
  if (!target) return;

  // Deactivate all tabs
  document.querySelectorAll(".admin-tab").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".admin-tab-content").forEach((c) => c.classList.remove("active"));

  // Activate clicked tab
  btn.classList.add("active");
  const el = document.getElementById(target);
  if (el) {
    el.classList.add("active");
    // Re-trigger animation
    el.style.animation = "none";
    el.offsetHeight; // reflow
    el.style.animation = "";
  }
});

// ---------- Login exclusivo do admin ----------
const loginScreen = document.getElementById("admin-login-screen");
const contentEl = document.getElementById("admin-content");
const loginForm = document.getElementById("admin-login-form");
const loginError = document.getElementById("admin-login-error");
const loginBtn = document.getElementById("admin-login-btn");

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  loginBtn.disabled = true;
  loginBtn.textContent = "Entrando...";

  const email = document.getElementById("admin-email").value.trim();
  const password = document.getElementById("admin-password").value;

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);

    const isAdmin = await checkIsAdminWithRetry(cred.user.uid);
    if (!isAdmin) {
      await signOut(auth);
      loginError.textContent = "Essa conta não tem permissão de administrador.";
      loginError.hidden = false;
      return;
    }

    currentUser = cred.user;
    loginScreen.style.display = "none";
    contentEl.hidden = false;
    document.getElementById("admin-session-email").textContent = currentUser.email;
    init();
  } catch (err) {
    console.error("Erro no login do admin:", err);
    loginError.textContent = friendlyLoginError(err.code);
    loginError.hidden = false;
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Entrar";
  }
});

async function checkIsAdminWithRetry(uid, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await checkIsAdmin(uid);
    } catch (err) {
      const isLastAttempt = i === attempts - 1;
      if (err.code !== "permission-denied" || isLastAttempt) throw err;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
}

document.getElementById("admin-logout-btn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.reload();
});

function friendlyLoginError(code) {
  const map = {
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/user-not-found": "Usuário não encontrado.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/too-many-requests": "Muitas tentativas. Tente novamente mais tarde.",
    "auth/invalid-email": "E-mail inválido.",
  };
  return map[code] || "Não foi possível entrar. Tente novamente.";
}

function init() {
  subscribeToAllUsers((users) => {
    allUsersCache = users;
    renderFilteredUsers();
  });
  subscribeToAllMissions((missions) => {
    allMissionsCatalog = missions;
    renderExistingMissionSelect();
  });

  // Data para "Adicionar Missões"
  const dateInput = document.getElementById("assignment-date");
  dateInput.value = todayKey();

  // Data para "Missões Ativas"
  const activeDateInput = document.getElementById("active-missions-date");
  activeDateInput.value = todayKey();
  activeDateInput.addEventListener("change", () => watchActiveDate(activeDateInput.value));
  watchActiveDate(activeDateInput.value);

  // Ranking
  subscribeToRanking(renderAdminRanking);

  // Search filter
  const filterInput = document.getElementById("users-filter");
  filterInput.addEventListener("input", () => renderFilteredUsers());
}

// ---------- Criar usuário ----------
const createUserForm = document.getElementById("create-user-form");
const createUserError = document.getElementById("create-user-error");
const createUserSuccess = document.getElementById("create-user-success");
const createUserBtn = document.getElementById("create-user-btn");

createUserForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  createUserError.hidden = true;
  createUserSuccess.hidden = true;

  const name = document.getElementById("new-name").value.trim();
  const username = document.getElementById("new-username").value.trim();
  const email = document.getElementById("new-email").value.trim();
  const password = document.getElementById("new-password").value;
  const avatar = document.querySelector('input[name="new-avatar"]:checked').value;

  createUserBtn.disabled = true;
  createUserBtn.innerHTML = "Criando...";

  try {
    // A função createUserAsAdmin agora também cria o perfil no Firestore via REST API
    // para contornar qualquer problema de regras de segurança não sincronizadas.
    const uid = await createUserAsAdmin({ name, username, email, password, avatar });

    createUserSuccess.textContent = `Usuário "${name}" criado com sucesso.`;
    createUserSuccess.hidden = false;
    createUserForm.reset();
  } catch (err) {
    createUserError.textContent = err.code ? friendlyAuthError(err.code) : err.message;
    createUserError.hidden = false;
  } finally {
    createUserBtn.disabled = false;
    createUserBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="1.8"/><line x1="19" y1="8" x2="19" y2="14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="22" y1="11" x2="16" y2="11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg> Criar usuário`;
  }
});

function friendlyAuthError(code) {
  const map = {
    "auth/email-already-in-use": "Esse e-mail já está cadastrado.",
    "auth/invalid-email": "E-mail inválido.",
    "auth/weak-password": "A senha é muito fraca (mínimo 6 caracteres).",
  };
  return map[code] || "Não foi possível criar o usuário. Tente de novo.";
}

// ---------- Lista de usuários com filtro ----------
const usersListEl = document.getElementById("users-list");
const usersCountEl = document.getElementById("users-count");
const usersFilterInput = document.getElementById("users-filter");

function renderFilteredUsers() {
  const query = (usersFilterInput?.value || "").toLowerCase().trim();
  let filtered = allUsersCache;

  if (query) {
    filtered = allUsersCache.filter((u) => {
      return (
        (u.name || "").toLowerCase().includes(query) ||
        (u.username || "").toLowerCase().includes(query) ||
        (u.email || "").toLowerCase().includes(query)
      );
    });
  }

  usersCountEl.textContent = `${filtered.length} de ${allUsersCache.length} usuários`;
  renderUsersList(filtered);
}

function renderUsersList(users) {
  if (!users.length) {
    usersListEl.innerHTML = `<p class="admin-empty-msg">Nenhum usuário encontrado.</p>`;
    return;
  }

  usersListEl.innerHTML = users
    .map((u) => {
      const disabled = !!u.disabled;
      return `
        <div class="admin-user-row">
          <div class="admin-user-info">
            <p class="admin-user-name">
              ${escapeHtml(u.name)}
              <span class="admin-status ${disabled ? "disabled" : "active"}">${disabled ? "Desativado" : "Ativo"}</span>
            </p>
            <p class="admin-user-meta">@${escapeHtml(u.username)} · ${escapeHtml(u.email)} · ${u.totalXp || 0} XP</p>
          </div>
          <div class="admin-user-actions">
            <button class="admin-btn-sm" data-view-uid="${u.id}" data-name="${escapeHtml(u.name)}" data-username="${escapeHtml(u.username)}" data-xp="${u.totalXp || 0}">Ver</button>
            <button class="admin-btn-sm ${disabled ? "ok" : "danger"}" data-uid="${u.id}" data-disabled="${disabled}">
              ${disabled ? "Reativar" : "Desativar"}
            </button>
          </div>
        </div>
      `;
    })
    .join("");
}

usersListEl.addEventListener("click", async (e) => {
  const disableBtn = e.target.closest("button[data-uid]");
  if (disableBtn) {
    const uid = disableBtn.dataset.uid;
    const isCurrentlyDisabled = disableBtn.dataset.disabled === "true";
    disableBtn.disabled = true;
    try {
      await setUserDisabled(uid, !isCurrentlyDisabled);
    } finally {
      disableBtn.disabled = false;
    }
    return;
  }

  const viewBtn = e.target.closest("button[data-view-uid]");
  if (viewBtn) {
    const uid = viewBtn.dataset.viewUid;
    openUserDetails(uid, {
      name: viewBtn.dataset.name,
      username: viewBtn.dataset.username,
      xp: viewBtn.dataset.xp,
    });
  }
});

const userModal = document.getElementById("user-details-modal");
const userModalName = document.getElementById("user-modal-name");
const userModalInfo = document.getElementById("user-modal-info");
const umTabs = document.querySelectorAll("#user-modal-tabs .admin-tab");
const umTabContents = document.querySelectorAll(".um-tab-content");

let currentUserMissions = [];
let currentUserPhotos = [];
let currentUserReferrals = [];

let currentUmTab = "missions";

// Paginação simples (se necessário depois). Por enquanto sem paginação para simplificar.
document.getElementById("user-modal-close")?.addEventListener("click", () => {
  userModal.style.display = "none";
});

umTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    umTabs.forEach((t) => t.classList.remove("active"));
    umTabContents.forEach((c) => (c.style.display = "none"));
    tab.classList.add("active");
    const target = tab.dataset.umTab;
    document.getElementById(`um-tab-${target}`).style.display = "block";
    currentUmTab = target;
  });
});

async function openUserDetails(uid, user) {
  userModalName.textContent = user.name;
  userModalInfo.innerHTML = `@${user.username} &bull; ${user.xp} XP total`;
  
  document.getElementById("user-modal-logs-missions").innerHTML = `<p class="admin-empty-msg">Buscando histórico...</p>`;
  document.getElementById("user-modal-logs-photos").innerHTML = `<p class="admin-empty-msg">Buscando histórico...</p>`;
  document.getElementById("user-modal-logs-referrals").innerHTML = `<p class="admin-empty-msg">Buscando indicações...</p>`;
  
  // Reseta para primeira aba
  umTabs[0].click();
  userModal.style.display = "flex";

  try {
    const logs = await getMissionLogsForUser(uid);
    currentUserMissions = logs.filter(l => !l.proofData?.photoUrl && !l.referralId);
    currentUserPhotos = logs.filter(l => !!l.proofData?.photoUrl);
    
    // Indicações ainda estão misturadas em missionLogs? Se estiverem com referralId, nós pegamos daqui.
    // Mas talvez seja melhor buscar da collection `volunteers`.
    // Por enquanto, vamos extrair os logs de convite (referralId).
    currentUserReferrals = logs.filter(l => !!l.referralId);
    
    renderMissionsTab();
    renderPhotosTab();
    renderReferralsTab();
  } catch (err) {
    document.getElementById("user-modal-logs-missions").innerHTML = `<p style="color:red;font-size:0.875rem;">Erro: ${err.message || err.toString()}</p>`;
    console.error(err);
  }
}

function renderMissionsTab() {
  const container = document.getElementById("user-modal-logs-missions");
  if (!currentUserMissions.length) {
    container.innerHTML = `<p class="admin-empty-msg">Nenhuma missão diária concluída.</p>`;
    return;
  }
  container.innerHTML = currentUserMissions.map((log) => buildLogHtml(log)).join("");
}

function renderPhotosTab() {
  const container = document.getElementById("user-modal-logs-photos");
  if (!currentUserPhotos.length) {
    container.innerHTML = `<p class="admin-empty-msg">Nenhuma foto registrada.</p>`;
    return;
  }
  container.innerHTML = currentUserPhotos.map((log) => buildLogHtml(log)).join("");
  attachPhotoEvents(container);
}

function renderReferralsTab() {
  const container = document.getElementById("user-modal-logs-referrals");
  if (!currentUserReferrals.length) {
    container.innerHTML = `<p class="admin-empty-msg">Nenhuma indicação registrada.</p>`;
    return;
  }
  container.innerHTML = currentUserReferrals.map((log) => buildLogHtml(log)).join("");
}

function buildLogHtml(log) {
  const mission = allMissionsCatalog.find((m) => m.id === log.missionId);
  const title = mission ? mission.title : (log.referralId ? "Indicação de Voluntário" : log.missionId);
  const dateStr = log.completedAt?.toDate ? log.completedAt.toDate().toLocaleString("pt-BR") : log.date;
  
  let proofHtml = "";
  if (log.proofData) {
    proofHtml += `<div style="margin-top:0.5rem;padding:0.5rem;background:#f5f5f5;border-radius:0.5rem;font-size:0.875rem;">`;
    if (log.proofData.local) proofHtml += `<p style="margin:0 0 0.25rem;"><strong>Local:</strong> ${escapeHtml(log.proofData.local)}</p>`;
    if (log.proofData.referencia) proofHtml += `<p style="margin:0 0 0.25rem;"><strong>Ref:</strong> ${escapeHtml(log.proofData.referencia)}</p>`;
    if (log.proofData.localInicio) proofHtml += `<p style="margin:0 0 0.25rem;"><strong>Início:</strong> ${escapeHtml(log.proofData.localInicio)}</p>`;
    if (log.proofData.photoUrl) {
      proofHtml += `<button type="button" class="btn-view-photo" data-url="${log.proofData.photoUrl}" style="margin-top:0.5rem;color:var(--brand);background:none;border:none;padding:0;font-weight:600;cursor:pointer;font-size:0.875rem;">Ver Foto &rarr;</button>`;
    }
    proofHtml += `</div>`;
  }
  
  return `
    <div style="border-bottom:1px solid #eee;padding:1rem 0;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <strong style="display:block;margin-bottom:0.25rem;">${escapeHtml(title)}</strong>
          <span style="font-size:0.75rem;color:#666;">${dateStr}</span>
        </div>
        <span style="font-size:0.875rem;font-weight:600;color:var(--mint);">+${log.xpAwarded} XP</span>
      </div>
      ${proofHtml}
    </div>
  `;
}

function attachPhotoEvents(container) {
  const photoBtns = container.querySelectorAll(".btn-view-photo");
  photoBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      const url = e.target.dataset.url;
      openPhotoPopup(url);
    });
  });
}

function openPhotoPopup(url) {
  const overlay = document.createElement("div");
  overlay.style.cssText = "display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:10000;align-items:center;justify-content:center;padding:1rem;";
  overlay.innerHTML = `
    <div style="position:relative;max-width:100%;max-height:100%;display:flex;flex-direction:column;align-items:center;">
      <button style="position:absolute;top:-2rem;right:0;background:none;border:none;color:#fff;font-size:2rem;cursor:pointer;">&times;</button>
      <img src="${url}" style="max-width:100%;max-height:85vh;border-radius:0.5rem;box-shadow:0 10px 25px rgba(0,0,0,0.5);" />
    </div>
  `;
  document.body.appendChild(overlay);
  
  overlay.addEventListener("click", (e) => {
    if (e.target.tagName !== 'IMG') {
      overlay.remove();
    }
  });
}

// ---------- Adicionar Missões ----------
const existingMissionSelect = document.getElementById("existing-mission-select");
const assignExistingBtn = document.getElementById("assign-existing-btn");
const createMissionForm = document.getElementById("create-mission-form");
const createMissionError = document.getElementById("create-mission-error");
const createMissionSuccess = document.getElementById("create-mission-success");
const createMissionBtn = document.getElementById("create-mission-btn");

function renderExistingMissionSelect() {
  existingMissionSelect.innerHTML = allMissionsCatalog
    .map((m) => `<option value="${m.id}">${escapeHtml(m.title)} (+${m.xpReward} XP)</option>`)
    .join("");
}

assignExistingBtn.addEventListener("click", async () => {
  const missionId = existingMissionSelect.value;
  const date = document.getElementById("assignment-date").value;
  if (!missionId || !date) return;
  assignExistingBtn.disabled = true;
  try {
    await assignMissionToDate(missionId, date);
  } finally {
    assignExistingBtn.disabled = false;
  }
});

createMissionForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  createMissionError.hidden = true;
  createMissionSuccess.hidden = true;

  const date = document.getElementById("assignment-date").value;
  if (!date) {
    createMissionError.textContent = "Escolha uma data primeiro.";
    createMissionError.hidden = false;
    return;
  }

  createMissionBtn.disabled = true;
  createMissionBtn.textContent = "Criando...";

  try {
    const missionId = await createMission({
      title: document.getElementById("mission-title").value.trim(),
      description: document.getElementById("mission-description").value.trim(),
      xpReward: document.getElementById("mission-xp").value,
      difficulty: document.getElementById("mission-difficulty").value,
    });
    await assignMissionToDate(missionId, date);
    createMissionSuccess.textContent = "Missão criada e atribuída.";
    createMissionSuccess.hidden = false;
    createMissionForm.reset();
    document.getElementById("mission-xp").value = 150;
  } catch (err) {
    createMissionError.textContent = "Não foi possível criar a missão. Tente de novo.";
    createMissionError.hidden = false;
  } finally {
    createMissionBtn.disabled = false;
    createMissionBtn.textContent = "Criar e atribuir a essa data";
  }
});

// ---------- Missões Ativas ----------
const assignedMissionsListEl = document.getElementById("assigned-missions-list");

function watchActiveDate(date) {
  if (activeMissionsUnsub) activeMissionsUnsub();
  activeMissionDetailUnsubs.forEach((u) => u());
  activeMissionDetailUnsubs = [];

  activeMissionsUnsub = subscribeToAssignmentForDate(date, (assignment) => {
    renderAssignedMissions(date, assignment?.missionIds || []);
  });
}

function renderAssignedMissions(date, missionIds) {
  activeMissionDetailUnsubs.forEach((u) => u());
  activeMissionDetailUnsubs = [];

  if (!missionIds.length) {
    assignedMissionsListEl.innerHTML = `<p class="admin-empty-msg">Nenhuma missão atribuída nessa data.</p>`;
    return;
  }

  const details = {};
  assignedMissionsListEl.innerHTML = `<p class="admin-empty-msg">Carregando...</p>`;

  missionIds.forEach((id) => {
    const unsub = subscribeToMission(id, (mission) => {
      details[id] = mission;
      if (Object.keys(details).length === missionIds.length) {
        paintAssignedList(date, missionIds, details);
      }
    });
    activeMissionDetailUnsubs.push(unsub);
  });
}

function paintAssignedList(date, missionIds, details) {
  assignedMissionsListEl.innerHTML = missionIds
    .map((id) => {
      const m = details[id];
      if (!m) return "";
      return `
        <div class="admin-mission-row">
          <div>
            <p class="admin-mission-name">${escapeHtml(m.title)}</p>
            <p class="admin-mission-meta">+${m.xpReward} XP · ${escapeHtml(m.difficulty)}</p>
          </div>
          <div>
            <button class="admin-btn-sm danger" data-remove-id="${id}" data-date="${date}">Remover</button>
          </div>
        </div>
      `;
    })
    .join("");
}

assignedMissionsListEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-remove-id]");
  if (!btn) return;
  btn.disabled = true;
  try {
    await removeMissionFromDate(btn.dataset.removeId, btn.dataset.date);
  } finally {
    btn.disabled = false;
  }
});

// ---------- Ranking no admin ----------
const MEDALS = ["🥇", "🥈", "🥉"];
const adminRankingTable = document.getElementById("admin-ranking-table");

function renderAdminRanking(rows) {
  if (!rows.length) {
    adminRankingTable.innerHTML = `<p class="admin-empty-msg">Ninguém no ranking ainda.</p>`;
    return;
  }

  adminRankingTable.innerHTML = rows
    .map((row) => {
      const medal = MEDALS[row.rank - 1] || row.rank;
      return `
        <div class="admin-rank-row">
          <div class="admin-rank-left">
            <span class="admin-rank-position">${medal}</span>
            <div class="admin-rank-avatar"><img src="assets/${row.avatar || 'avatar-default.svg'}" alt="" /></div>
            <div>
              <p class="admin-rank-name">${escapeHtml(row.name)}</p>
              <p class="admin-rank-username">@${escapeHtml(row.username)}</p>
            </div>
          </div>
          <span class="admin-rank-xp">${(row.totalXp || 0).toLocaleString("pt-BR")} XP</span>
        </div>
      `;
    })
    .join("");
}

// ---------- Helpers ----------
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
