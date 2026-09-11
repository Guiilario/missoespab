const DIFFICULTY_LABEL = {
  easy: "Fácil",
  medium: "Média",
  hard: "Difícil",
};

const DIFFICULTY_DOTS = {
  easy: 1,
  medium: 2,
  hard: 3,
};

function DifficultyMeter({ difficulty = "easy" }) {
  const active = DIFFICULTY_DOTS[difficulty] || 1;
  return (
    <div className="flex items-center gap-1" aria-label={`Dificuldade: ${DIFFICULTY_LABEL[difficulty]}`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`h-1.5 w-1.5 rounded-full ${i < active ? "bg-brand-600" : "bg-brand-100"}`}
        />
      ))}
      <span className="ml-1.5 text-xs text-ink/50">{DIFFICULTY_LABEL[difficulty]}</span>
    </div>
  );
}

export default function MissionCard({ index, mission, status, onAct, busy }) {
  const isCompleted = status === "completed";
  const isExpired = status === "expired";
  const isPending = status === "pending_validation";
  const isInProgress = status === "in_progress";

  return (
    <div
      className={`rounded-xl2 border bg-white p-5 shadow-card transition-opacity ${
        isExpired ? "opacity-50" : ""
      } ${isCompleted ? "border-mint/40" : "border-black/5"}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <p className="font-display text-xs font-semibold tracking-wide text-brand-600">
            Missão {String(index + 1).padStart(2, "0")}
          </p>
          <h3 className="font-display mt-1 text-lg font-semibold text-ink">
            {mission.title}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-ink/60">{mission.description}</p>
        </div>
        {mission.imageUrl && (
          <img
            src={mission.imageUrl}
            alt=""
            className="h-16 w-16 flex-shrink-0 rounded-lg object-cover"
          />
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-mint/10 px-2.5 py-1 text-xs font-semibold text-mint">
            +{mission.xpReward} XP
          </span>
          <DifficultyMeter difficulty={mission.difficulty} />
        </div>

        {isCompleted ? (
          <span className="flex items-center gap-1.5 text-sm font-medium text-mint">
            <CheckIcon /> Concluída
          </span>
        ) : isExpired ? (
          <span className="text-sm font-medium text-ink/40">Expirada</span>
        ) : (
          <button
            onClick={onAct}
            disabled={busy || isPending}
            className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {isPending ? "Validando..." : isInProgress ? "Continuar" : "Cumprir missão"}
          </button>
        )}
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="12" fill="#1FAE6B" fillOpacity="0.15" />
      <path
        d="M7 12.5l3 3 7-7"
        stroke="#1FAE6B"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
