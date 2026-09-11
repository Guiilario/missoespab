import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { getLevelProgress } from "../lib/xp";
import {
  subscribeToDailyAssignment,
  subscribeToMission,
  completeMission,
  markDayCompleted,
  getCompletionsForToday,
} from "../lib/firestore";
import XPBar from "../components/XPBar";
import MissionCard from "../components/MissionCard";

export default function Dashboard() {
  const { user, profile } = useAuth();
  const [assignment, setAssignment] = useState(undefined); // undefined = loading
  const [missions, setMissions] = useState({});
  const [completions, setCompletions] = useState({});
  const [busyMissionId, setBusyMissionId] = useState(null);
  const [justFinishedDay, setJustFinishedDay] = useState(false);

  // Subscribe to today's assignment
  useEffect(() => {
    if (!user) return;
    return subscribeToDailyAssignment(user.uid, setAssignment);
  }, [user]);

  // Subscribe to each assigned mission's details
  useEffect(() => {
    if (!assignment?.missionIds) return;
    const unsubs = assignment.missionIds.map((id) =>
      subscribeToMission(id, (m) =>
        setMissions((prev) => ({ ...prev, [id]: m }))
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [assignment]);

  // Load which missions are already completed today
  useEffect(() => {
    if (!user || !assignment?.missionIds) return;
    getCompletionsForToday(user.uid, assignment.missionIds).then(setCompletions);
  }, [user, assignment]);

  const missionIds = assignment?.missionIds || [];
  const completedCount = missionIds.filter((id) => completions[id]).length;
  const allDone = missionIds.length > 0 && completedCount === missionIds.length;

  const levelInfo = useMemo(
    () => getLevelProgress(profile?.totalXp || 0),
    [profile?.totalXp]
  );

  useEffect(() => {
    if (allDone && user) {
      markDayCompleted(user.uid);
      setJustFinishedDay(true);
    }
  }, [allDone, user]);

  async function handleComplete(missionId, xpReward) {
    setBusyMissionId(missionId);
    try {
      await completeMission(user.uid, missionId, xpReward);
      setCompletions((prev) => ({ ...prev, [missionId]: true }));
    } finally {
      setBusyMissionId(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl2 bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white shadow-soft">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/15 text-lg font-semibold">
              {(profile?.name || "?").charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-display text-base font-semibold">
                {profile?.name || "Carregando..."}
              </p>
              <p className="text-sm text-white/70">@{profile?.username}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 rounded-full bg-white/15 px-3 py-1.5 text-sm font-medium">
            🔥 {profile?.currentStreak || 0} dias
          </div>
        </div>

        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            <span className="font-display text-2xl font-bold">
              Nível {String(levelInfo.level).padStart(2, "0")}
            </span>
            <span className="text-sm text-white/80">
              {levelInfo.xpIntoLevel.toLocaleString("pt-BR")} /{" "}
              {levelInfo.xpForNext.toLocaleString("pt-BR")} XP
            </span>
          </div>
          <div className="mt-2">
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/20">
              <div
                className="xp-fill h-full rounded-full bg-white"
                style={{ width: `${levelInfo.percent}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Daily progress */}
      <div className="rounded-xl2 border border-black/5 bg-white p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-ink">
            Missões de hoje
          </h2>
          <span className="text-sm text-ink/50">
            {completedCount} de {missionIds.length || 3} concluídas
          </span>
        </div>
        <div className="mt-3 flex gap-2">
          {(missionIds.length ? missionIds : [1, 2, 3]).map((id, i) => (
            <span
              key={id}
              className={`h-2 flex-1 rounded-full ${
                i < completedCount ? "bg-brand-600" : "bg-brand-50"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Completion celebration */}
      {allDone && justFinishedDay && (
        <div className="pop-in rounded-xl2 border border-mint/30 bg-mint/5 p-6 text-center">
          <p className="text-3xl">🎉</p>
          <h2 className="font-display mt-2 text-xl font-bold text-ink">
            Dia concluído!
          </h2>
          <p className="mt-1 text-sm text-ink/60">
            Você completou todas as missões de hoje.
          </p>
          <div className="mt-4 flex justify-center gap-6 text-sm">
            <Stat label="Nível" value={levelInfo.level} />
            <Stat label="XP total" value={levelInfo.totalXp.toLocaleString("pt-BR")} />
            <Stat label="Sequência" value={`${profile?.currentStreak || 0} dias`} />
          </div>
        </div>
      )}

      {/* Missions */}
      <div className="space-y-3">
        {assignment === undefined && (
          <p className="text-center text-sm text-ink/40">Carregando missões...</p>
        )}
        {assignment === null && (
          <p className="rounded-xl2 border border-dashed border-black/10 p-6 text-center text-sm text-ink/40">
            Nenhuma missão disponível para hoje ainda. Volte em breve.
          </p>
        )}
        {missionIds.map((id, i) => {
          const mission = missions[id];
          if (!mission) return null;
          const isCompleted = !!completions[id];
          return (
            <MissionCard
              key={id}
              index={i}
              mission={mission}
              status={isCompleted ? "completed" : "available"}
              busy={busyMissionId === id}
              onAct={() => handleComplete(id, mission.xpReward)}
            />
          );
        })}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="font-display text-lg font-bold text-ink">{value}</p>
      <p className="text-xs text-ink/50">{label}</p>
    </div>
  );
}
