import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    username: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (form.password !== form.confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    if (form.password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setLoading(true);
    try {
      await register(form);
      navigate("/");
    } catch (err) {
      setError(friendlyError(err.code));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-600">
            <span className="font-display text-lg font-bold text-white">M</span>
          </div>
          <h1 className="font-display text-2xl font-bold text-ink">Criar conta</h1>
          <p className="mt-1 text-sm text-ink/50">Comece a cumprir missões hoje.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Nome" value={form.name} onChange={update("name")} />
          <Field label="Usuário" value={form.username} onChange={update("username")} />
          <Field
            label="E-mail"
            type="email"
            value={form.email}
            onChange={update("email")}
          />
          <Field
            label="Senha"
            type="password"
            value={form.password}
            onChange={update("password")}
          />
          <Field
            label="Confirmar senha"
            type="password"
            value={form.confirm}
            onChange={update("confirm")}
          />

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {loading ? "Criando conta..." : "Criar conta"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-ink/60">
          Já tem uma conta?{" "}
          <Link to="/entrar" className="font-medium text-brand-600 hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}

function Field({ label, type = "text", value, onChange }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-ink/70">{label}</label>
      <input
        type={type}
        required
        value={value}
        onChange={onChange}
        className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm outline-none transition focus:border-brand-600"
      />
    </div>
  );
}

function friendlyError(code) {
  const map = {
    "auth/email-already-in-use": "Esse e-mail já está cadastrado.",
    "auth/invalid-email": "E-mail inválido.",
    "auth/weak-password": "A senha é muito fraca.",
  };
  return map[code] || "Não foi possível criar a conta. Tente novamente.";
}
