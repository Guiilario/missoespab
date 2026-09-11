import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { subscribeToRanking } from "../lib/firestore";

const MEDALS = ["🥇", "🥈", "🥉"];

export default function Ranking() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);

  useEffect(() => subscribeToRanking(setRows), []);

  const myRow = rows.find((r) => r.id === user?.uid);
  const myRankVisible = !!myRow;

  return (
    <div className="space-y-4">
      <h1 className="font-display text-xl font-bold text-ink">Ranking</h1>

      <div className="overflow-hidden rounded-xl2 border border-black/5 bg-white shadow-card">
        {rows.map((row) => (
          <RankRow
            key={row.id}
            row={row}
            isMe={row.id === user?.uid}
          />
        ))}
        {rows.length === 0 && (
          <p className="p-6 text-center text-sm text-ink/40">Ninguém no ranking ainda.</p>
        )}
      </div>

      {!myRankVisible && (
        <div className="rounded-xl2 border border-brand-600/20 bg-brand-50 p-5">
          <p className="font-display text-xs font-semibold uppercase tracking-wide text-brand-700">
            Sua posição
          </p>
          <p className="mt-1 text-sm text-ink/60">Continue completando missões para subir no ranking.</p>
        </div>
      )}
    </div>
  );
}

function RankRow({ row, isMe }) {
  return (
    <div
      className={`flex items-center justify-between border-b border-black/5 px-5 py-3.5 last:border-b-0 ${
        isMe ? "bg-brand-50" : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="w-8 text-center font-display text-sm font-semibold text-ink/50">
          {MEDALS[row.rank - 1] || row.rank}
        </span>
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
          {(row.name || "?").charAt(0).toUpperCase()}
        </div>
        <div>
          <p className={`text-sm font-medium ${isMe ? "text-brand-700" : "text-ink"}`}>
            {row.name} {isMe && <span className="text-xs text-brand-600">(você)</span>}
          </p>
          <p className="text-xs text-ink/40">@{row.username}</p>
        </div>
      </div>
      <span className="font-display text-sm font-semibold text-ink">
        {(row.totalXp || 0).toLocaleString("pt-BR")} XP
      </span>
    </div>
  );
}
