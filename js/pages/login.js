import {
  auth,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
} from "../firebase.js";

const form = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const errorMsg = document.getElementById("error-msg");
const successMsg = document.getElementById("success-msg");
const submitBtn = document.getElementById("submit-btn");
const resetBtn = document.getElementById("reset-btn");

function showError(text) {
  errorMsg.textContent = text;
  errorMsg.hidden = false;
  successMsg.hidden = true;
}
function showSuccess(text) {
  successMsg.textContent = text;
  successMsg.hidden = false;
  errorMsg.hidden = true;
}
function clearMessages() {
  errorMsg.hidden = true;
  successMsg.hidden = true;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearMessages();
  submitBtn.disabled = true;
  submitBtn.textContent = "Entrando...";

  try {
    await signInWithEmailAndPassword(auth, emailInput.value, passwordInput.value);
    window.location.href = "index.html";
  } catch (err) {
    showError(friendlyError(err.code));
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Entrar";
  }
});

resetBtn.addEventListener("click", async () => {
  if (!emailInput.value) {
    showError("Digite seu e-mail para redefinir a senha.");
    return;
  }
  try {
    await sendPasswordResetEmail(auth, emailInput.value);
    showSuccess("E-mail de redefinição enviado.");
  } catch (err) {
    showError(friendlyError(err.code));
  }
});

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
