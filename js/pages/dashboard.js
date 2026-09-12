import { renderNav } from "../nav.js";
import { getLevelProgress } from "../xp.js";
import {
  subscribeToDailyAssignment,
  subscribeToMission,
  completeMission,
  markDayCompleted,
  getCompletionsForToday,
} from "../firestore.js";
import { missionCardHtml } from "../mission-card.js";

renderNav("hoje");

let currentUser = null;
let assignment = undefined; // undefined = carregando, null = nenhuma
let missions = {}; // { missionId: missionData }
let completions = {}; // { missionId: bool }
let missionUnsubs = [];
let assignmentUnsub = null;
let busyMissionId = null;
let dayJustCelebrated = false;

const missionsListEl = document.getElementById("missions-list");
const dailyDotsEl = document.getElementById("daily-dots");
const dailyProgressLabelEl = document.getElementById("daily-progress-label");
const celebrationSlot = document.getElementById("celebration-slot");

window.addEventListener("auth-ready", (e) => {
  const { user, profile } = e.detail;
  const isFirstLoad = !currentUser;
  currentUser = user;

  if (isFirstLoad) {
    assignmentUnsub = subscribeToDailyAssignment(user.uid, onAssignmentChange);
  }

  renderHeader(profile);
});

function renderHeader(profile) {
  if (!profile) return;
  const levelInfo = getLevelProgress(profile.totalXp || 0);

  document.getElementById("header-avatar").textContent = (profile.name || "?")
    .charAt(0)
    .toUpperCase();
  document.getElementById("header-name").textContent = profile.name || "";
  document.getElementById("header-username").textContent = `@${profile.username || ""}`;
  document.getElementById("header-streak").textContent = profile.currentStreak || 0;
  document.getElementById(
    "header-level"
  ).textContent = `Nível ${String(levelInfo.level).padStart(2, "0")}`;
  document.getElementById("header-xp-label").textContent = `${levelInfo.xpIntoLevel.toLocaleString(
    "pt-BR"
  )} / ${levelInfo.xpForNext.toLocaleString("pt-BR")} XP`;
  document.getElementById("header-progress-fill").style.width = `${levelInfo.percent}%`;

  renderCelebrationIfNeeded(profile, levelInfo);
}

async function onAssignmentChange(newAssignment) {
  assignment = newAssignment;

  // Cancela assinaturas de missões antigas
  missionUnsubs.forEach((u) => u());
  missionUnsubs = [];
  missions = {};

  renderMissionsList();

  if (!assignment?.missionIds?.length) return;

  completions = await getCompletionsForToday(currentUser.uid, assignment.missionIds);
  renderMissionsList();
  maybeCompleteDay();

  assignment.missionIds.forEach((id) => {
    const unsub = subscribeToMission(id, (mission) => {
      missions[id] = mission;
      renderMissionsList();
    });
    missionUnsubs.push(unsub);
  });
}

function renderMissionsList() {
  if (assignment === undefined) {
    missionsListEl.innerHTML = `<p class="missions-loading">Carregando missões...</p>`;
    return;
  }
  if (assignment === null || !assignment.missionIds?.length) {
    missionsListEl.innerHTML = `<p class="missions-empty">Nenhuma missão disponível para hoje ainda. Volte em breve.</p>`;
    return;
  }

  const missionIds = assignment.missionIds;
  const completedCount = missionIds.filter((id) => completions[id]).length;

  dailyProgressLabelEl.textContent = `${completedCount} de ${missionIds.length} concluídas`;
  dailyDotsEl.innerHTML = missionIds
    .map((_, i) => `<span class="daily-dot ${i < completedCount ? "filled" : ""}"></span>`)
    .join("");

  const cardsHtml = missionIds
    .map((id, i) => {
      const mission = missions[id];
      if (!mission) return "";
      const status = completions[id] ? "completed" : "available";
      return missionCardHtml({ index: i, mission, status, busy: busyMissionId === id });
    })
    .join("");

  missionsListEl.innerHTML =
    cardsHtml || `<p class="missions-loading">Carregando missões...</p>`;
}

missionsListEl.addEventListener("click", async (e) => {
  const btn = e.target.closest(".btn-mission");
  if (!btn) return;

  const missionId = btn.dataset.missionId;
  const mission = missions[missionId];
  if (!mission || busyMissionId) return;

  busyMissionId = missionId;
  renderMissionsList();

  try {
    await completeMission(currentUser.uid, missionId, mission.xpReward);
    completions[missionId] = true;
  } finally {
    busyMissionId = null;
    renderMissionsList();
    maybeCompleteDay();
  }
});

function maybeCompleteDay() {
  if (!assignment?.missionIds?.length) return;
  const allDone = assignment.missionIds.every((id) => completions[id]);
  if (allDone && currentUser) {
    markDayCompleted(currentUser.uid);
    dayJustCelebrated = true;
  }
}

function renderCelebrationIfNeeded(profile, levelInfo) {
  const allDone =
    assignment?.missionIds?.length &&
    assignment.missionIds.every((id) => completions[id]);

  if (!allDone || !dayJustCelebrated) {
    celebrationSlot.innerHTML = "";
    return;
  }

  celebrationSlot.innerHTML = `
    <div class="celebration section-gap">
      <p class="emoji">🎉</p>
      <h2 class="font-display">Dia concluído!</h2>
      <p>Você completou todas as missões de hoje.</p>
      <div class="celebration-stats">
        <div class="stat-block">
          <p class="stat-value font-display">${levelInfo.level}</p>
          <p class="stat-label">Nível</p>
        </div>
        <div class="stat-block">
          <p class="stat-value font-display">${levelInfo.totalXp.toLocaleString("pt-BR")}</p>
          <p class="stat-label">XP total</p>
        </div>
        <div class="stat-block">
          <p class="stat-value font-display">${profile.currentStreak || 0} dias</p>
          <p class="stat-label">Sequência</p>
        </div>
      </div>
    </div>
  `;
}
