import { renderNav } from "../nav.js";
import { auth, signInWithEmailAndPassword, signOut, createUserAsAdmin } from "../firebase.js";
import {
  checkIsAdmin,
  createUserProfile,
  subscribeToAllUsers,
  setUserDisabled,
  subscribeToAllMissions,
  assignMissionToDate,
  removeMissionFromDate,
  subscribeToAssignmentForDate,
  subscribeToMission,
  todayKey,
  getMissionLogsForUser,
  getDocs,
} from "../firestore.js";

renderNav("admin"); // não corresponde a nenhum item da nav — fica sem destaque

let currentUser = null;
let allMissionsCatalog = [];
let assignmentUnsub = null;
let missionDetailUnsubs = [];

// ---------- Login exclusivo do admin ----------
// Esta página NÃO reaproveita a sessão normal do app (não usa auth-guard.js):
// toda vez que alguém abre admin.html, ela pede e-mail/senha de novo, e só
// libera o conteúdo depois de duas checagens: (1) a senha bate no Firebase
// Authentication de verdade, e (2) essa conta está marcada como admin no
// Firestore (coleção admins/{uid}).
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

    // Logo após o login, o Firestore às vezes ainda não "recebeu" o token
    // novo (race condition rara mas real) e recusa a próxima leitura por
    // permissão mesmo com tudo certo. Se isso acontecer, espera um instante
    // e tenta de novo antes de desistir.
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
  subscribeToAllUsers(renderUsersList);
  subscribeToAllMissions((missions) => {
    allMissionsCatalog = missions;
    renderExistingMissionSelect();
  });

  const dateInput = document.getElementById("assignment-date");
  dateInput.value = todayKey();
  dateInput.addEventListener("change", () => watchDate(dateInput.value));
  watchDate(dateInput.value);
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

  createUserBtn.disabled = true;
  createUserBtn.textContent = "Criando...";

  try {
    const uid = await createUserAsAdmin({ name, email, password });

    try {
      await createUserProfile(uid, { name, username, email });
    } catch (profileErr) {
      // A conta de login JÁ foi criada nesse ponto — só o perfil no
      // Firestore falhou. Mostra o erro real (não um genérico) porque
      // "tentar de novo" com o mesmo e-mail vai dar "já existe".
      throw new Error(
        `Login criado, mas falhou ao salvar o perfil (${
          profileErr.code || profileErr.message
        }). Copie esse código e me avise — não tente criar de novo com o mesmo e-mail.`
      );
    }

    createUserSuccess.textContent = `Usuário "${name}" criado com sucesso.`;
    createUserSuccess.hidden = false;
    createUserForm.reset();
  } catch (err) {
    createUserError.textContent = err.code ? friendlyAuthError(err.code) : err.message;
    createUserError.hidden = false;
  } finally {
    createUserBtn.disabled = false;
    createUserBtn.textContent = "Criar usuário";
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

// ---------- Lista de usuários ----------
const usersListEl = document.getElementById("users-list");

function renderUsersList(users) {
  if (!users.length) {
    usersListEl.innerHTML = `<p class="missions-loading">Nenhum usuário ainda.</p>`;
    return;
  }

  usersListEl.innerHTML = users
    .map((u) => {
      const disabled = !!u.disabled;
      return `
        <div class="admin-row">
          <div>
            <p class="admin-row-name">${escapeHtml(u.name)} <span class="admin-badge ${
        disabled ? "off" : ""
      }">${disabled ? "Desativado" : "Ativo"}</span></p>
            <p class="admin-row-sub">@${escapeHtml(u.username)} · ${escapeHtml(u.email)} · ${
        u.totalXp || 0
      } XP</p>
          </div>
          <div class="admin-row-actions">
            <button class="admin-btn-small" data-view-uid="${u.id}" data-name="${escapeHtml(u.name)}" data-username="${escapeHtml(u.username)}" data-xp="${u.totalXp || 0}">Ver</button>
            <button class="admin-btn-small ${disabled ? "ok" : "danger"}" data-uid="${u.id}" data-disabled="${disabled}">
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

// ---------- Modal de Detalhes do Usuário ----------
const userModal = document.getElementById("user-details-modal");
const userModalName = document.getElementById("user-modal-name");
const userModalInfo = document.getElementById("user-modal-info");
const userModalLogs = document.getElementById("user-modal-logs");

document.getElementById("user-modal-close")?.addEventListener("click", () => {
  userModal.style.display = "none";
});

async function openUserDetails(uid, user) {
  userModalName.textContent = user.name;
  userModalInfo.innerHTML = `@${user.username} &bull; ${user.xp} XP total`;
  userModalLogs.innerHTML = `<p class="missions-loading">Buscando histórico...</p>`;
  userModal.style.display = "flex";

  try {
    const logs = await getMissionLogsForUser(uid);
    if (!logs.length) {
      userModalLogs.innerHTML = `<p class="missions-loading">Nenhuma missão concluída.</p>`;
      return;
    }

    userModalLogs.innerHTML = logs.map((log) => {
      const mission = allMissionsCatalog.find((m) => m.id === log.missionId);
      const title = mission ? mission.title : log.missionId;
      const dateStr = log.completedAt?.toDate ? log.completedAt.toDate().toLocaleString("pt-BR") : log.date;
      
      let proofHtml = "";
      if (log.proofData) {
        proofHtml += `<div style="margin-top:0.5rem;padding:0.5rem;background:#f5f5f5;border-radius:0.5rem;font-size:0.875rem;">`;
        if (log.proofData.local) proofHtml += `<p style="margin:0 0 0.25rem;"><strong>Local:</strong> ${escapeHtml(log.proofData.local)}</p>`;
        if (log.proofData.referencia) proofHtml += `<p style="margin:0 0 0.25rem;"><strong>Ref:</strong> ${escapeHtml(log.proofData.referencia)}</p>`;
        if (log.proofData.localInicio) proofHtml += `<p style="margin:0 0 0.25rem;"><strong>Início:</strong> ${escapeHtml(log.proofData.localInicio)}</p>`;
        if (log.proofData.photoUrl) {
          proofHtml += `<a href="${log.proofData.photoUrl}" target="_blank" style="display:inline-block;margin-top:0.5rem;color:var(--brand);text-decoration:none;font-weight:600;">Ver Foto &rarr;</a>`;
        }
        proofHtml += `</div>`;
      } else if (log.referralId) {
         proofHtml += `<div style="margin-top:0.5rem;padding:0.5rem;background:#f5f5f5;border-radius:0.5rem;font-size:0.875rem;">`;
         proofHtml += `<p style="margin:0;">Convite de voluntário</p>`;
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
    }).join("");
  } catch (err) {
    userModalLogs.innerHTML = `<p style="color:red;font-size:0.875rem;">Erro ao buscar histórico.</p>`;
    console.error(err);
  }
}

// ---------- Missão do dia ----------
const existingMissionSelect = document.getElementById("existing-mission-select");
const assignExistingBtn = document.getElementById("assign-existing-btn");
const createMissionForm = document.getElementById("create-mission-form");
const createMissionError = document.getElementById("create-mission-error");
const createMissionSuccess = document.getElementById("create-mission-success");
const createMissionBtn = document.getElementById("create-mission-btn");
const assignedMissionsListEl = document.getElementById("assigned-missions-list");

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

function watchDate(date) {
  if (assignmentUnsub) assignmentUnsub();
  missionDetailUnsubs.forEach((u) => u());
  missionDetailUnsubs = [];

  assignmentUnsub = subscribeToAssignmentForDate(date, (assignment) => {
    renderAssignedMissions(date, assignment?.missionIds || []);
  });
}

function renderAssignedMissions(date, missionIds) {
  missionDetailUnsubs.forEach((u) => u());
  missionDetailUnsubs = [];

  if (!missionIds.length) {
    assignedMissionsListEl.innerHTML = `<p class="missions-loading">Nenhuma missão atribuída nessa data.</p>`;
    return;
  }

  const details = {};
  assignedMissionsListEl.innerHTML = `<p class="missions-loading">Carregando...</p>`;

  missionIds.forEach((id) => {
    const unsub = subscribeToMission(id, (mission) => {
      details[id] = mission;
      if (Object.keys(details).length === missionIds.length) {
        paintAssignedList(date, missionIds, details);
      }
    });
    missionDetailUnsubs.push(unsub);
  });
}

function paintAssignedList(date, missionIds, details) {
  assignedMissionsListEl.innerHTML = missionIds
    .map((id) => {
      const m = details[id];
      if (!m) return "";
      return `
        <div class="admin-row">
          <div>
            <p class="admin-row-name">${escapeHtml(m.title)}</p>
            <p class="admin-row-sub">+${m.xpReward} XP · ${escapeHtml(m.difficulty)}</p>
          </div>
          <div class="admin-row-actions">
            <button class="admin-btn-small danger" data-remove-id="${id}" data-date="${date}">Remover</button>
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

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
