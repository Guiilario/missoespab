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
  uploadMissionPhoto,
  createConversion,
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
let activeTimers = {}; // { missionId: { endTime: number, intervalId: number, gpsIntervalId: number } }

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) + 
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function recordGPSPoint(missionId) {
  if ("geolocation" in navigator) {
    navigator.geolocation.getCurrentPosition((position) => {
      const pointsStr = localStorage.getItem(`timer_points_${missionId}`);
      let points = pointsStr ? JSON.parse(pointsStr) : [];
      points.push({ lat: position.coords.latitude, lng: position.coords.longitude, time: Date.now() });
      localStorage.setItem(`timer_points_${missionId}`, JSON.stringify(points));
    }, (err) => console.warn("GPS tracking error:", err), { enableHighAccuracy: true });
  }
}

const missionsListEl = document.getElementById("missions-list");
const dailyDotsEl = document.getElementById("daily-dots");
const dailyProgressLabelEl = document.getElementById("daily-progress-label");
const celebrationSlot = document.getElementById("celebration-slot");
const toastEl = document.getElementById("mission-toast");

// ---- Modal de Adesivagem (injetado uma única vez) ----
const modalOverlay = document.createElement("div");
modalOverlay.id = "adesivagem-modal";
modalOverlay.style.cssText = "display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;align-items:center;justify-content:center;padding:1rem;";
modalOverlay.innerHTML = `
  <div style="background:var(--paper);border-radius:var(--radius-xl);padding:1.5rem;max-width:400px;width:100%;box-shadow:var(--shadow-card);">
    <h3 style="font-family:var(--font-display);margin:0 0 1rem;font-size:1.1rem;">Comprovar Adesivagem</h3>
    <label style="display:block;margin-bottom:.75rem;font-size:.875rem;">
      Local de adesivagem
      <input type="text" id="modal-local" placeholder="Ex: Rua das Flores, 123" style="display:block;width:100%;margin-top:.25rem;padding:.5rem .75rem;border:1px solid #ccc;border-radius:.5rem;font-size:.875rem;font-family:var(--font-body);" />
    </label>
    <label style="display:block;margin-bottom:.75rem;font-size:.875rem;">
      Referência
      <input type="text" id="modal-referencia" placeholder="Ex: Próximo ao mercado" style="display:block;width:100%;margin-top:.25rem;padding:.5rem .75rem;border:1px solid #ccc;border-radius:.5rem;font-size:.875rem;font-family:var(--font-body);" />
    </label>
    <div style="margin-bottom:1rem;">
      <label for="modal-foto" style="display:block;width:100%;padding:0.75rem;background:#eee;color:#333;text-align:center;border-radius:0.5rem;font-size:0.875rem;font-weight:600;cursor:pointer;border:1px solid #ccc;font-family:var(--font-body);">
        📷 Registrar com foto
      </label>
      <input type="file" id="modal-foto" accept="image/*" capture="environment" style="display:none;" />
    </div>
    <div id="modal-preview" style="display:none;margin-bottom:1rem;text-align:center;">
      <img id="modal-preview-img" style="max-width:100%;max-height:200px;border-radius:.5rem;" />
    </div>
    <p id="modal-error" style="color:#d32f2f;font-size:.8rem;margin:0 0 .75rem;display:none;"></p>
    <div style="display:flex;gap:.75rem;">
      <button id="modal-cancel" style="flex:1;padding:.6rem;border:1px solid #ccc;background:transparent;border-radius:.5rem;cursor:pointer;font-family:var(--font-body);font-size:.875rem;">Cancelar</button>
      <button id="modal-submit" style="flex:1;padding:.6rem;border:none;background:var(--brand);color:#fff;border-radius:.5rem;cursor:pointer;font-family:var(--font-body);font-size:.875rem;font-weight:600;">Enviar</button>
    </div>
  </div>
`;
document.body.appendChild(modalOverlay);

const modalFotoInput = document.getElementById("modal-foto");
const modalPreview = document.getElementById("modal-preview");
const modalPreviewImg = document.getElementById("modal-preview-img");
modalFotoInput.addEventListener("change", () => {
  const file = modalFotoInput.files[0];
  if (file) {
    modalPreview.style.display = "block";
    modalPreviewImg.src = URL.createObjectURL(file);
  } else {
    modalPreview.style.display = "none";
  }
});

let pendingAdesivagem = null; // { missionId, mission }

document.getElementById("modal-cancel").addEventListener("click", () => {
  modalOverlay.style.display = "none";
  pendingAdesivagem = null;
});

document.getElementById("modal-submit").addEventListener("click", async () => {
  const local = document.getElementById("modal-local").value.trim();
  const referencia = document.getElementById("modal-referencia").value.trim();
  const file = modalFotoInput.files[0];
  const errorEl = document.getElementById("modal-error");

  if (!local || !referencia) {
    errorEl.textContent = "Preencha o local e a referência.";
    errorEl.style.display = "block";
    return;
  }
  if (!file) {
    errorEl.textContent = "Tire ou selecione uma foto do adesivo.";
    errorEl.style.display = "block";
    return;
  }
  errorEl.style.display = "none";

  const submitBtn = document.getElementById("modal-submit");
  submitBtn.disabled = true;
  submitBtn.textContent = "Enviando...";

  try {
    const photoUrl = await uploadMissionPhoto(currentUser.uid, file);
    const { missionId, mission } = pendingAdesivagem;
    const proofData = { local, referencia, photoUrl };
    await completeRepeatableMission(currentUser.uid, missionId, mission.xpReward, proofData);
    completions[missionId] = true;
    alert("Missão concluída!");
    modalOverlay.style.display = "none";
    renderMissionsList();
    maybeCompleteDay();
  } catch (err) {
    console.error("Erro ao enviar adesivagem:", err);
    errorEl.textContent = "Erro ao enviar. Tente novamente.";
    errorEl.style.display = "block";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Enviar";
    pendingAdesivagem = null;
  }
});

// ---- Modal de Conversão (injetado uma única vez) ----
const modalConversaoOverlay = document.createElement("div");
modalConversaoOverlay.id = "conversao-modal";
modalConversaoOverlay.style.cssText = "display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;align-items:center;justify-content:center;padding:1rem;";
modalConversaoOverlay.innerHTML = `
  <div style="background:var(--paper);border-radius:var(--radius-xl);padding:1.5rem;max-width:400px;width:100%;box-shadow:var(--shadow-card);">
    <h3 style="font-family:var(--font-display);margin:0 0 1rem;font-size:1.1rem;">Registrar Conversão</h3>
    <label style="display:block;margin-bottom:.75rem;font-size:.875rem;">
      Nome do convertido
      <input type="text" id="modal-conversao-nome" placeholder="Ex: João da Silva" style="display:block;width:100%;margin-top:.25rem;padding:.5rem .75rem;border:1px solid #ccc;border-radius:.5rem;font-size:.875rem;font-family:var(--font-body);" />
    </label>
    <label style="display:block;margin-bottom:.75rem;font-size:.875rem;">
      WhatsApp
      <input type="text" id="modal-conversao-whatsapp" placeholder="Ex: 11999999999" style="display:block;width:100%;margin-top:.25rem;padding:.5rem .75rem;border:1px solid #ccc;border-radius:.5rem;font-size:.875rem;font-family:var(--font-body);" />
    </label>
    <p id="modal-conversao-error" style="color:#d32f2f;font-size:.8rem;margin:0 0 .75rem;display:none;"></p>
    <div style="display:flex;gap:.75rem;">
      <button id="modal-conversao-cancel" style="flex:1;padding:.6rem;border:1px solid #ccc;background:transparent;border-radius:.5rem;cursor:pointer;font-family:var(--font-body);font-size:.875rem;">Cancelar</button>
      <button id="modal-conversao-submit" style="flex:1;padding:.6rem;border:none;background:var(--brand);color:#fff;border-radius:.5rem;cursor:pointer;font-family:var(--font-body);font-size:.875rem;font-weight:600;">Enviar</button>
    </div>
  </div>
`;
document.body.appendChild(modalConversaoOverlay);

let pendingConversao = null; // { missionId, mission }

document.getElementById("modal-conversao-cancel").addEventListener("click", () => {
  modalConversaoOverlay.style.display = "none";
  pendingConversao = null;
});

document.getElementById("modal-conversao-submit").addEventListener("click", async () => {
  const name = document.getElementById("modal-conversao-nome").value.trim();
  const whatsapp = document.getElementById("modal-conversao-whatsapp").value.trim();
  const errorEl = document.getElementById("modal-conversao-error");

  if (!name || !whatsapp) {
    errorEl.textContent = "Preencha o nome e o WhatsApp.";
    errorEl.style.display = "block";
    return;
  }
  errorEl.style.display = "none";

  const submitBtn = document.getElementById("modal-conversao-submit");
  submitBtn.disabled = true;
  submitBtn.textContent = "Enviando...";

  try {
    const { missionId, mission } = pendingConversao;
    await createConversion(currentUser.uid, missionId, mission.xpReward, { name, whatsapp });
    completions[missionId] = true;
    alert("Missão concluída!");
    modalConversaoOverlay.style.display = "none";
    renderMissionsList();
    maybeCompleteDay();
  } catch (err) {
    console.error("Erro ao registrar conversão:", err);
    errorEl.textContent = "Erro ao enviar. Tente novamente.";
    errorEl.style.display = "block";
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Enviar";
    pendingConversao = null;
  }
});

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
  document.getElementById("header-username").textContent = "@" + (profile.username || "");
  const avatarImg = document.querySelector(".header-avatar img");
  if (avatarImg) avatarImg.src = `assets/${profile.avatar || 'avatar-default.svg'}`;
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
        const isRepeatable = titleLower.includes("adesivagem") || titleLower.includes("panfletagem") || titleLower.includes("conversão") || titleLower.includes("conversao") || titleLower.includes("convert");
        if (isRepeatable) {
          status = "available"; // Nunca bloqueia visualmente se pode repetir
        }
        
        let busy = busyMissionId === id;
        let actionLabel = undefined;
        
        let timer = activeTimers[id];
        if (!timer) {
          const savedEnd = localStorage.getItem(`timer_${id}`);
          if (savedEnd) {
             const end = parseInt(savedEnd, 10);
             timer = { endTime: end, local: localStorage.getItem(`timer_local_${id}`) };
             activeTimers[id] = timer;
             const intervalId = setInterval(() => {
               if (Date.now() >= end) {
                 clearInterval(intervalId);
                 if (timer.gpsIntervalId) clearInterval(timer.gpsIntervalId);
               }
               renderMissionsList();
             }, 1000);
             timer.intervalId = intervalId;
             timer.gpsIntervalId = setInterval(() => recordGPSPoint(id), 10 * 60 * 1000);
          }
        }
        
        if (timer) {
          const now = Date.now();
          if (now < timer.endTime) {
            busy = true;
            const remaining = timer.endTime - now;
            const m = Math.floor(remaining / 60000);
            const s = Math.floor((remaining % 60000) / 1000);
            actionLabel = `Aguarde... (${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")})`;
          } else {
            actionLabel = "Concluir (Tempo esgotado)";
          }
        } else if (isRepeatable && completions[id]) {
          actionLabel = "Repetir missão";
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
      localStorage.setItem(`timer_${missionId}`, endTime.toString());
      localStorage.setItem(`timer_local_${missionId}`, local);
      localStorage.setItem(`timer_points_${missionId}`, JSON.stringify([]));
      
      activeTimers[missionId] = { endTime, local };
      
      recordGPSPoint(missionId); // Captura o primeiro ponto imediatamente
      
      const intervalId = setInterval(() => {
        if (Date.now() >= endTime) {
          clearInterval(intervalId);
          clearInterval(activeTimers[missionId].gpsIntervalId);
        }
        renderMissionsList();
      }, 1000); // Atualiza a cada 1 segundo
      
      const gpsIntervalId = setInterval(() => recordGPSPoint(missionId), 10 * 60 * 1000); // a cada 10 min
      
      activeTimers[missionId].intervalId = intervalId;
      activeTimers[missionId].gpsIntervalId = gpsIntervalId;
      renderMissionsList();
      return;
    } else {
      if (Date.now() < timer.endTime) {
        return; // ainda rodando
      }
    }
  }
  
  // Adesivagem (modal com foto)
  if (titleLower.includes("adesivagem")) {
    // Abre o modal em vez de prompt()
    pendingAdesivagem = { missionId, mission };
    document.getElementById("modal-local").value = "";
    document.getElementById("modal-referencia").value = "";
    modalFotoInput.value = "";
    modalPreview.style.display = "none";
    document.getElementById("modal-error").style.display = "none";
    document.getElementById("modal-submit").textContent = "Enviar";
    document.getElementById("modal-submit").disabled = false;
    modalOverlay.style.display = "flex";
    return;
  }
  
  // Conversão (modal)
  if (titleLower.includes("conversão") || titleLower.includes("conversao") || titleLower.includes("convert")) {
    pendingConversao = { missionId, mission };
    document.getElementById("modal-conversao-nome").value = "";
    document.getElementById("modal-conversao-whatsapp").value = "";
    document.getElementById("modal-conversao-error").style.display = "none";
    document.getElementById("modal-conversao-submit").textContent = "Enviar";
    document.getElementById("modal-conversao-submit").disabled = false;
    modalConversaoOverlay.style.display = "flex";
    return;
  }
  
  let proofData = null;
  let finalXpReward = mission.xpReward;
  let completionMessage = "Missão concluída!";

  if (titleLower.includes("panfletagem")) {
    const pointsStr = localStorage.getItem(`timer_points_${missionId}`);
    const points = pointsStr ? JSON.parse(pointsStr) : [];
    
    let totalDistance = 0;
    for (let i = 1; i < points.length; i++) {
      totalDistance += calculateDistance(points[i-1].lat, points[i-1].lng, points[i].lat, points[i].lng);
    }
    
    const bonusXp = Math.floor(totalDistance) * 10;
    finalXpReward += bonusXp;
    
    proofData = { 
      localInicio: activeTimers[missionId].local,
      distanceKm: totalDistance,
      bonusXp: bonusXp,
      trackPoints: points
    };
    
    if (bonusXp > 0) {
      completionMessage = `Missão concluída!\nDistância percorrida: ${totalDistance.toFixed(2)} km.\nBônus recebido: +${bonusXp} XP!`;
    }
  }

  busyMissionId = missionId;
  renderMissionsList();

  try {
    const isRepeatable = titleLower.includes("adesivagem") || titleLower.includes("panfletagem") || titleLower.includes("conversão") || titleLower.includes("conversao") || titleLower.includes("convert");
    if (isRepeatable) {
      await completeRepeatableMission(currentUser.uid, missionId, finalXpReward, proofData);
      if (titleLower.includes("panfletagem")) {
        clearInterval(activeTimers[missionId].intervalId);
        if (activeTimers[missionId].gpsIntervalId) clearInterval(activeTimers[missionId].gpsIntervalId);
        delete activeTimers[missionId];
        localStorage.removeItem(`timer_${missionId}`);
        localStorage.removeItem(`timer_local_${missionId}`);
        localStorage.removeItem(`timer_points_${missionId}`);
      }
    } else {
      await completeMission(currentUser.uid, missionId, finalXpReward);
    }
    completions[missionId] = true;
    alert(completionMessage);
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
