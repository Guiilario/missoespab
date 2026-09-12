import { renderNav } from "../nav.js";
import { getLevelProgress } from "../xp.js";
import { updateUserProfile } from "../firestore.js";
import { auth, signOut, updatePassword } from "../firebase.js";

renderNav("perfil");

let currentUser = null;
let currentProfile = null;

const nameSlot = document.getElementById("profile-name-slot");
const editBtn = document.getElementById("edit-profile-btn");
const msgEl = document.getElementById("profile-msg");

window.addEventListener("auth-ready", (e) => {
  currentUser = e.detail.user;
  currentProfile = e.detail.profile;
  render();
});

function render() {
  if (!currentProfile) return;
  const levelInfo = getLevelProgress(currentProfile.totalXp || 0);

  document.getElementById("profile-avatar").textContent = (currentProfile.name || "?")
    .charAt(0)
    .toUpperCase();
  document.getElementById("profile-username").textContent = `@${currentProfile.username || ""}`;
  document.getElementById("profile-level").textContent = `Nível ${levelInfo.level}`;
  document.getElementById(
    "profile-xp-amount"
  ).textContent = `${levelInfo.xpIntoLevel}/${levelInfo.xpForNext} XP`;
  document.getElementById("profile-progress-fill").style.width = `${levelInfo.percent}%`;

  document.getElementById("stat-xp").textContent = levelInfo.totalXp.toLocaleString("pt-BR");
  document.getElementById("stat-missions").textContent = currentProfile.completedMissionsCount || 0;
  document.getElementById("stat-streak").textContent = `${currentProfile.currentStreak || 0}d`;
  document.getElementById("stat-days").textContent = currentProfile.daysCompleted || 0;

  renderNameSlot();
}

function renderNameSlot(editing = false) {
  if (editing) {
    nameSlot.innerHTML = `
      <div class="profile-name-edit">
        <input type="text" id="name-input" value="${escapeAttr(currentProfile.name)}" />
        <button id="save-name-btn">Salvar</button>
      </div>
    `;
    document.getElementById("save-name-btn").addEventListener("click", async () => {
      const newName = document.getElementById("name-input").value.trim();
      if (newName) {
        await updateUserProfile(currentUser.uid, { name: newName });
        currentProfile.name = newName;
      }
      renderNameSlot(false);
    });
  } else {
    nameSlot.innerHTML = `<h1 class="profile-name font-display">${escapeHtml(
      currentProfile.name
    )}</h1>`;
  }
}

editBtn.addEventListener("click", () => {
  const isEditing = !!nameSlot.querySelector("#name-input");
  renderNameSlot(!isEditing);
});

// ---------- Trocar senha ----------
const changePwBtn = document.getElementById("change-pw-btn");
const passwordBox = document.getElementById("password-box");
const newPasswordInput = document.getElementById("new-password");
const confirmPwBtn = document.getElementById("confirm-pw-btn");
const cancelPwBtn = document.getElementById("cancel-pw-btn");

changePwBtn.addEventListener("click", () => {
  passwordBox.hidden = false;
  changePwBtn.hidden = true;
});
cancelPwBtn.addEventListener("click", () => {
  passwordBox.hidden = true;
  changePwBtn.hidden = false;
  newPasswordInput.value = "";
});
confirmPwBtn.addEventListener("click", async () => {
  showMsg("");
  try {
    await updatePassword(currentUser, newPasswordInput.value);
    showMsg("Senha atualizada com sucesso.");
    passwordBox.hidden = true;
    changePwBtn.hidden = false;
    newPasswordInput.value = "";
  } catch (err) {
    showMsg("Não foi possível atualizar. Faça login novamente e tente de novo.");
  }
});

function showMsg(text) {
  if (!text) {
    msgEl.hidden = true;
    return;
  }
  msgEl.textContent = text;
  msgEl.hidden = false;
}

// ---------- Logout ----------
document.getElementById("logout-btn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "entrar.html";
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
function escapeAttr(str) {
  return (str ?? "").replace(/"/g, "&quot;");
}
