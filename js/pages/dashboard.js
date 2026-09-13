import { renderNav } from "../nav.js";
import { getLevelProgress } from "../xp.js";
import {
  subscribeToDailyAssignment,
  subscribeToMission,
  subscribeToTodayReferrals,
  completeMission,
  markDayCompleted,
  getCompletionsForToday,
  completeRepeatableMission,
  completeReferralMission,
} from "../firestore.js";
import { missionCardHtml } from "../mission-card.js";

renderNav("hoje");

// Missão fixa, presente todo dia pra todo usuário. Ela só é concluída quando
// alguém se cadastra de verdade pelo link de convite deste usuário (ver
// convite.html) — não é honor system como as outras, porque depende de uma
// ação real de outra pessoa. As demais missões do dia vêm do CMS do
// administrador (via dailyAssignments/missions no Firestore).
const PERMANENT_MISSION = {
  id: "convide-um-amigo",
  title: "Convide um amigo",
  description:
    "Envie seu link de convite. A missão completa quando alguém preencher o formulário de inscrição como voluntário.",
  xpReward: 200,
  difficulty: "easy",
};

let currentUser = null;
let assignment = undefined; // undefined = carregando, null = nenhuma missão do admin ainda
let adminMissions = {}; // { missionId: missionData }
let completions = {}; // { missionId: bool }, inclui a missão permanente
let missionUnsubs = [];
let busyMissionId = null;
let dayJustCelebrated = false;

// Estado local para timers da Panfletagem
let activeTimers = {}; // { missionId: { endTime: number, intervalId: number } }

const missionsListEl = document.getElementById("missions-list");
const dailyDotsEl = document.getElementById("daily-dots");
const dailyProgressLabelEl = document.getElementById("daily-progress-label");
const celebrationSlot = document.getElementById("celebration-slot");
const toastEl = document.getElementById("mission-toast");

window.addEventListener("auth-ready", async (e) => {
  const { user, profile } = e.detail;
  const isFirstLoad = !currentUser;
  currentUser = user;

  if (isFirstLoad) {
    const permanentStatus = await getCompletionsForToday(user.uid, [PERMANENT_MISSION.id]);
    completions = { ...completions, ...permanentStatus };
    renderMissionsList();
    // maybeCompleteDay() só roda depois que soubermos o estado real das
    // missões do admin (dentro de onAssignmentChange), pra não marcar o dia
    // como concluído baseado só na missão permanente antes da hora.

    subscribeToDailyAssignment(onAssignmentChange);

    // Detecta em tempo real quando alguém se cadastra pelo link deste usuário.
    // Como a missão é permanente, ganha XP a cada convite.
    subscribeToTodayReferrals(user.uid, async (referrals) => {
      if (referrals.length > 0) {
        for (const referral of referrals) {
          await completeReferralMission(user.uid, referral.id, PERMANENT_MISSION.xpReward);
        }
        completions[PERMANENT_MISSION.id] = true; // Para progresso visual se necessário (embora não feche a missão permanente)
        renderMissionsList();
        maybeCompleteDay();
      }
    });
  }

  renderHeader(profile);
});

function renderHeader(profile) {
  if (!profile) return;
  const levelInfo = getLevelProgress(profile.totalXp || 0);

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

  missionUnsubs.forEach((u) => u());
  missionUnsubs = [];
  adminMissions = {};

  renderMissionsList();

  if (!assignment?.missionIds?.length) {
    // Sem missões do admin ainda hoje — a permanente sozinha já pode
    // completar o dia.
    maybeCompleteDay();
    return;
  }

  const adminStatus = await getCompletionsForToday(currentUser.uid, assignment.missionIds);
  completions = { ...completions, ...adminStatus };
  renderMissionsList();
  maybeCompleteDay();

  assignment.missionIds.forEach((id) => {
    const unsub = subscribeToMission(id, (mission) => {
      adminMissions[id] = mission;
      renderMissionsList();
    });
    missionUnsubs.push(unsub);
  });
}

function allMissionIds() {
  return [PERMANENT_MISSION.id, ...(assignment?.missionIds || [])];
}

function renderMissionsList() {
  const ids = allMissionIds();
  const completedCount = ids.filter((id) => completions[id]).length;

  dailyProgressLabelEl.textContent = `${completedCount} de ${ids.length} concluídas`;
  dailyDotsEl.innerHTML = ids
    .map((_, i) => `<span class="daily-dot ${i < completedCount ? "filled" : ""}"></span>`)
    .join("");

  const permanentCardHtml = missionCardHtml({
    index: 0,
    mission: PERMANENT_MISSION,
    status: "available", // Sempre disponível para repetir
    busy: busyMissionId === PERMANENT_MISSION.id,
    actionLabel: "Copiar link de convite",
    customEyebrow: "Missão Permanente"
  });

  let adminCardsHtml = "";
  if (assignment?.missionIds?.length) {
    adminCardsHtml = assignment.missionIds
      .map((id, i) => {
        const mission = adminMissions[id];
        if (!mission) return "";
        
        let status = completions[id] ? "completed" : "available";
        const titleLower = (mission.title || "").toLowerCase();
        const isRepeatable = titleLower.includes("adesivagem") || titleLower.includes("panfletagem");
        if (isRepeatable) {
          status = "available"; // Nunca bloqueia visualmente se pode repetir
        }
        
        let busy = busyMissionId === id;
        let actionLabel = undefined;
        
        const timer = activeTimers[id];
        if (timer) {
          const now = Date.now();
          if (now < timer.endTime) {
            busy = true;
            const remainingMins = Math.ceil((timer.endTime - now) / 60000);
            actionLabel = `Aguarde... (${remainingMins}m)`;
          } else {
            actionLabel = "Concluir (Tempo esgotado)";
          }
        }
        
        return missionCardHtml({ 
          index: i + 1, 
          mission, 
          status, 
          busy, 
          actionLabel,
          customEyebrow: "Missão Diária"
        });
      })
      .join("");
  }

  missionsListEl.innerHTML = permanentCardHtml + adminCardsHtml;
}

missionsListEl.addEventListener("click", async (e) => {
  const btn = e.target.closest(".btn-mission");
  if (!btn || busyMissionId) return;

  const missionId = btn.dataset.missionId;

  if (missionId === PERMANENT_MISSION.id) {
    // Só copia/compartilha o link — a missão completa sozinha quando
    // alguém de fato se cadastrar por ele (ver subscribeToTodayReferrals).
    await shareInviteLink(currentUser.uid);
    return;
  }

  const mission = adminMissions[missionId];
  if (!mission) return;

  const titleLower = (mission.title || "").toLowerCase();
  
  // Timer de panfletagem
  if (titleLower.includes("panfletagem")) {
    const timer = activeTimers[missionId];
    if (!timer) {
      const local = prompt("Local que irá iniciar a panfletagem:");
      if (!local) return;
      
      const endTime = Date.now() + 60 * 60 * 1000; // 1 hora
      activeTimers[missionId] = { endTime, local };
      
      const intervalId = setInterval(() => {
        if (Date.now() >= endTime) {
          clearInterval(intervalId);
        }
        renderMissionsList();
      }, 60000); // Atualiza a cada 1 minuto
      
      activeTimers[missionId].intervalId = intervalId;
      renderMissionsList();
      return;
    } else {
      if (Date.now() < timer.endTime) {
        return; // ainda rodando, nao deveria ser clicável (pois ta busy) mas só garantindo
      }
      // Se passou o tempo, vai completar normal
    }
  }
  
  // Adesivagem (prompt)
  let proofData = null;
  if (titleLower.includes("adesivagem")) {
    const local = prompt("Local de adesivagem:");
    if (!local) return;
    const ref = prompt("Referência:");
    if (!ref) return;
    proofData = { local, referencia: ref };
  } else if (titleLower.includes("panfletagem")) {
    proofData = { localInicio: activeTimers[missionId].local };
  }

  busyMissionId = missionId;
  renderMissionsList();

  try {
    const isRepeatable = titleLower.includes("adesivagem") || titleLower.includes("panfletagem");
    if (isRepeatable) {
      await completeRepeatableMission(currentUser.uid, missionId, mission.xpReward, proofData);
      if (titleLower.includes("panfletagem")) {
        delete activeTimers[missionId];
      }
    } else {
      await completeMission(currentUser.uid, missionId, mission.xpReward);
    }
    completions[missionId] = true;
  } finally {
    busyMissionId = null;
    renderMissionsList();
    maybeCompleteDay();
  }
});

async function shareInviteLink(uid) {
  const link = new URL(`convite.html?u=${uid}`, window.location.href).href;
  const shareData = {
    title: "Convite para ser voluntário",
    text: "Quero te convidar pra ser voluntário! Preencha seu cadastro por aqui:",
    url: link,
  };
  try {
    if (navigator.share) {
      await navigator.share(shareData);
      return;
    }
  } catch {
    return; // usuário cancelou o compartilhamento
  }
  try {
    await navigator.clipboard.writeText(link);
    showToast("Link copiado! Envie pra pessoa que você quer convidar.");
  } catch {
    showToast(link);
  }
}

function showToast(text) {
  toastEl.textContent = text;
  toastEl.hidden = false;
  setTimeout(() => {
    toastEl.hidden = true;
  }, 5000);
}

function maybeCompleteDay() {
  if (assignment === undefined) return; // ainda não sabemos as missões do admin
  const ids = allMissionIds();
  const allDone = ids.length > 0 && ids.every((id) => completions[id]);
  if (allDone && currentUser) {
    markDayCompleted(currentUser.uid);
    dayJustCelebrated = true;
  }
}

function renderCelebrationIfNeeded(profile, levelInfo) {
  const ids = allMissionIds();
  const allDone = ids.length > 0 && ids.every((id) => completions[id]);

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
