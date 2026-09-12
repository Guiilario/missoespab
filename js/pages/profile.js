import { renderNav } from "../nav.js";
import { getLevelProgress } from "../xp.js";
import { subscribeToAllReferrals } from "../firestore.js";
import { auth, signOut } from "../firebase.js";

renderNav("perfil");

const referralsListEl = document.getElementById("referrals-list");
let referralsSubscribed = false;

window.addEventListener("auth-ready", (e) => {
  render(e.detail.profile);

  if (!referralsSubscribed) {
    referralsSubscribed = true;
    subscribeToAllReferrals(e.detail.user.uid, renderReferrals);
  }
});

function renderReferrals(referrals) {
  if (!referrals.length) {
    referralsListEl.innerHTML = `<p class="missions-loading" style="padding:0.5rem 0;">Você ainda não indicou ninguém. Use a missão "Convide um amigo" na tela Hoje.</p>`;
    return;
  }

  referralsListEl.innerHTML = referrals
    .map(
      (r) => `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0.625rem 0;border-bottom:1px solid rgba(0,0,0,0.05);">
        <div>
          <p style="margin:0;font-size:0.875rem;font-weight:500;">${escapeHtml(r.name)}</p>
          ${
            r.whatsapp
              ? `<p style="margin:0;font-size:0.75rem;color:rgba(11,15,25,0.5);">${escapeHtml(
                  r.whatsapp
                )}</p>`
              : ""
          }
        </div>
        <span style="font-size:0.75rem;color:rgba(11,15,25,0.4);">${formatDate(r.date)}</span>
      </div>
    `
    )
    .join("");
}

function formatDate(dateKey) {
  if (!dateKey) return "";
  const [y, m, d] = dateKey.split("-");
  return `${d}/${m}`;
}

function render(profile) {
  if (!profile) return;
  const levelInfo = getLevelProgress(profile.totalXp || 0);

  document.getElementById("profile-name").textContent = profile.name || "";
  document.getElementById("profile-username").textContent = `@${profile.username || ""}`;
  document.getElementById("profile-level").textContent = `Nível ${levelInfo.level}`;
  document.getElementById(
    "profile-xp-amount"
  ).textContent = `${levelInfo.xpIntoLevel}/${levelInfo.xpForNext} XP`;
  document.getElementById("profile-progress-fill").style.width = `${levelInfo.percent}%`;

  document.getElementById("stat-xp").textContent = levelInfo.totalXp.toLocaleString("pt-BR");
  document.getElementById("stat-missions").textContent = profile.completedMissionsCount || 0;
  document.getElementById("stat-streak").textContent = `${profile.currentStreak || 0}d`;
  document.getElementById("stat-days").textContent = profile.daysCompleted || 0;
}

// ---------- Sair ----------
document.getElementById("logout-btn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "entrar.html";
});

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
