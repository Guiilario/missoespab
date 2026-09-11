import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { updatePassword } from "firebase/auth";
import { useAuth } from "../context/AuthContext";
import { getLevelProgress } from "../lib/xp";
import { updateUserProfile } from "../lib/firestore";
import XPBar from "../components/XPBar";

export default function Profile() {
  const { user, profile, logout } = useAuth();
  const navigate = useNavigate();
  const levelInfo = useMemo(() => getLevelProgress(profile?.totalXp || 0), [profile?.totalXp]);

  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile?.name || "");
  const [changingPw, setChangingPw] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [msg, setMsg] = useState("");

  async function saveName() {
    await updateUserProfile(user.uid, { name });
    setEditing(false);
  }

  async function savePassword() {
    setMsg("");
    try {
      await updatePassword(user, newPw);
      setMsg("Senha atualizada com sucesso.");
      setChangingPw(false);
      setNewPw("");
    } catch (err) {
      setMsg("Não foi possível atualizar. Faça login novamente e tente de novo.");
    }
  }

  async function handleLogout() {
    await logout();
    navigate("/entrar");
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl2 border border-black/5 bg-white p-6 text-center shadow-card">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brand-100 text-2xl font-semibold text-brand-700">
          {(profile?.name || "?").charAt(0).toUpperCase()}
        </div>

        {editing ? (
          <div className="mt-3 flex items-center justify-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-black/10 px-3 py-1.5 text-center text-sm outline-none focus:border-brand-600"
            />
            <button onClick={saveName} className="text-sm font-medium text-brand-600">
              Salvar
            </button>
          </div>
        ) : (
          <h1 className="font-display mt-3 text-xl font-bold text-ink">{profile?.name}</h1>
        )}
        <p className="text-sm text-ink/50">@{profile?.username}</p>

        <div className="mx-auto mt-5 max-w-xs">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-display font-semibold text-ink">
              Nível {levelInfo.level}
            </span>
            <span className="text-ink/50">
              {levelInfo.xpIntoLevel}/{levelInfo.xpForNext} XP
            </span>
          </div>
          <div className="mt-1.5">
            <XPBar percent={levelInfo.percent} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <StatCard label="XP total" value={levelInfo.totalXp.toLocaleString("pt-BR")} />
        <StatCard label="Missões" value={profile?.completedMissionsCount || 0} />
        <StatCard label="Sequência" value={`${profile?.currentStreak || 0}d`} />
      </div>

      <div className="rounded-xl2 border border-black/5 bg-white p-5 shadow-card">
        <p className="text-sm font-medium text-ink">Dias completados</p>
        <p className="font-display mt-1 text-2xl font-bold text-brand-600">
          {profile?.daysCompleted || 0}
        </p>
      </div>

      <div className="space-y-2">
        <button
          onClick={() => setEditing((v) => !v)}
          className="w-full rounded-xl border border-black/10 bg-white py-3 text-sm font-medium text-ink transition hover:bg-black/5"
        >
          Editar perfil
        </button>

        {changingPw ? (
          <div className="space-y-2 rounded-xl border border-black/10 bg-white p-4">
            <input
              type="password"
              placeholder="Nova senha"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm outline-none focus:border-brand-600"
            />
            <div className="flex gap-2">
              <button
                onClick={savePassword}
                className="flex-1 rounded-lg bg-brand-600 py-2 text-sm font-medium text-white"
              >
                Confirmar
              </button>
              <button
                onClick={() => setChangingPw(false)}
                className="flex-1 rounded-lg border border-black/10 py-2 text-sm font-medium text-ink"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setChangingPw(true)}
            className="w-full rounded-xl border border-black/10 bg-white py-3 text-sm font-medium text-ink transition hover:bg-black/5"
          >
            Alterar senha
          </button>
        )}

        {msg && <p className="text-center text-sm text-ink/60">{msg}</p>}

        <button
          onClick={handleLogout}
          className="w-full rounded-xl bg-red-50 py-3 text-sm font-medium text-red-600 transition hover:bg-red-100"
        >
          Sair
        </button>
      </div>
    </div>
  );
}

function StatCard({ label, value }) {
  return (
    <div className="rounded-xl2 border border-black/5 bg-white p-4 text-center shadow-card">
      <p className="font-display text-lg font-bold text-ink">{value}</p>
      <p className="mt-0.5 text-xs text-ink/50">{label}</p>
    </div>
  );
}
