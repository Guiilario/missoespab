import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Login() {
  const { login, resetPassword } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(friendlyError(err.code));
    } finally {
      setLoading(false);
    }
  }

  async function handleReset() {
    if (!email) {
      setError("Digite seu e-mail para redefinir a senha.");
      return;
    }
    try {
      await resetPassword(email);
      setResetSent(true);
      setError("");
    } catch (err) {
      setError(friendlyError(err.code));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600">
            <span className="font-display text-lg font-bold text-white">M</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-ink">Entrar</h1>
          <p className="mt-1 text-sm text-ink/50">Continue de onde você parou.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink/70">
              E-mail ou usuário
            </label>
            <input
              type="text"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-600"
              placeholder="voce@email.com"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink/70">Senha</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-600"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {resetSent && (
            <p className="text-sm text-mint">E-mail de redefinição enviado.</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <div className="mt-4 flex items-center justify-between text-sm">
          <button onClick={handleReset} className="text-brand-600 hover:underline">
            Esqueci minha senha
          </button>
          <Link to="/cadastro" className="font-medium text-ink/70 hover:text-ink">
            Criar conta
          </Link>
        </div>
      </div>
    </div>
  );
}

function friendlyError(code) {
  const map = {
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/user-not-found": "Usuário não encontrado.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/too-many-requests": "Muitas tentativas. Tente novamente mais tarde.",
    "auth/invalid-email": "E-mail inválido.",
  };
  return map[code] || "Não foi possível entrar. Tente novamente.";
}
