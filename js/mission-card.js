const DIFFICULTY_LABEL = { easy: "Fácil", medium: "Média", hard: "Difícil" };
const DIFFICULTY_DOTS = { easy: 1, medium: 2, hard: 3 };

function difficultyMeterHtml(difficulty = "easy") {
  const active = DIFFICULTY_DOTS[difficulty] || 1;
  const dots = [0, 1, 2]
    .map((i) => `<span class="diff-dot ${i < active ? "on" : ""}"></span>`)
    .join("");
  return `<div class="diff-meter" aria-label="Dificuldade: ${DIFFICULTY_LABEL[difficulty]}">${dots}<span class="diff-label">${DIFFICULTY_LABEL[difficulty]}</span></div>`;
}

const CHECK_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="12" fill="#1FAE6B" fill-opacity="0.15"/><path d="M7 12.5l3 3 7-7" stroke="#1FAE6B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/**
 * Retorna o HTML de um card de missão.
 * status: "available" | "in_progress" | "pending_validation" | "completed" | "expired"
 */
export function missionCardHtml({ index, mission, status, busy }) {
  const isCompleted = status === "completed";
  const isExpired = status === "expired";
  const isPending = status === "pending_validation";
  const isInProgress = status === "in_progress";

  const actionLabel = busy
    ? "Validando..."
    : isPending
    ? "Validando..."
    : isInProgress
    ? "Continuar"
    : "Cumprir missão";

  const rightSideHtml = isCompleted
    ? `<span class="mission-status done">${CHECK_ICON} Concluída</span>`
    : isExpired
    ? `<span class="mission-status expired">Expirada</span>`
    : `<button class="btn-mission" data-mission-id="${mission.id}" ${
        busy || isPending ? "disabled" : ""
      }>${actionLabel}</button>`;

  return `
    <div class="mission-card ${isExpired ? "expired" : ""} ${
    isCompleted ? "completed" : ""
  }" data-mission-card="${mission.id}">
      <div class="mission-card-top">
        <div class="mission-card-text">
          <p class="mission-eyebrow">Missão ${String(index + 1).padStart(2, "0")}</p>
          <h3 class="mission-title">${escapeHtml(mission.title)}</h3>
          <p class="mission-desc">${escapeHtml(mission.description)}</p>
        </div>
        ${
          mission.imageUrl
            ? `<img src="${mission.imageUrl}" alt="" class="mission-image" />`
            : ""
        }
      </div>
      <div class="mission-card-bottom">
        <div class="mission-meta">
          <span class="xp-pill">+${mission.xpReward} XP</span>
          ${difficultyMeterHtml(mission.difficulty)}
        </div>
        ${rightSideHtml}
      </div>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
