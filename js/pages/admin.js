import { renderNav } from "../nav.js";
import { createUserAsAdmin } from "../firebase.js";
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
  todayKey,
} from "../firestore.js";

renderNav("admin"); // não corresponde a nenhum item da nav — fica sem destaque

let currentUser = null;
let allMissionsCatalog = [];
let assignmentUnsub = null;
let missionDetailUnsubs = [];

window.addEventListener("auth-ready", async (e) => {
  if (currentUser) return; // só roda o setup uma vez
  currentUser = e.detail.user;

  const isAdmin = await checkIsAdmin(currentUser.uid);
  if (!isAdmin) {
    alert("Acesso restrito a administradores.");
    window.location.href = "index.html";
    return;
  }

  init();
});

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
    await createUserProfile(uid, { name, username, email });
    createUserSuccess.textContent = `Usuário "${name}" criado com sucesso.`;
    createUserSuccess.hidden = false;
    createUserForm.reset();
  } catch (err) {
    createUserError.textContent = friendlyAuthError(err.code);
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
  const btn = e.target.closest("button[data-uid]");
  if (!btn) return;
  const uid = btn.dataset.uid;
  const isCurrentlyDisabled = btn.dataset.disabled === "true";
  btn.disabled = true;
  try {
    await setUserDisabled(uid, !isCurrentlyDisabled);
  } finally {
    btn.disabled = false;
  }
});

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
