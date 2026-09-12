import {
  auth,
  createUserWithEmailAndPassword,
  updateProfile,
} from "../firebase.js";
import { createUserProfile } from "../firestore.js";

const form = document.getElementById("register-form");
const nameInput = document.getElementById("name");
const usernameInput = document.getElementById("username");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const confirmInput = document.getElementById("confirm");
const errorMsg = document.getElementById("error-msg");
const submitBtn = document.getElementById("submit-btn");

function showError(text) {
  errorMsg.textContent = text;
  errorMsg.hidden = false;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorMsg.hidden = true;

  if (passwordInput.value !== confirmInput.value) {
    showError("As senhas não coincidem.");
    return;
  }
  if (passwordInput.value.length < 6) {
    showError("A senha deve ter pelo menos 6 caracteres.");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Criando conta...";

  try {
    const cred = await createUserWithEmailAndPassword(
      auth,
      emailInput.value,
      passwordInput.value
    );
    await updateProfile(cred.user, { displayName: nameInput.value });
    await createUserProfile(cred.user.uid, {
      name: nameInput.value,
      username: usernameInput.value,
      email: emailInput.value,
    });
    window.location.href = "index.html";
  } catch (err) {
    showError(friendlyError(err.code));
    submitBtn.disabled = false;
    submitBtn.textContent = "Criar conta";
  }
});

function friendlyError(code) {
  const map = {
    "auth/email-already-in-use": "Esse e-mail já está cadastrado.",
    "auth/invalid-email": "E-mail inválido.",
    "auth/weak-password": "A senha é muito fraca.",
  };
  return map[code] || "Não foi possível criar a conta. Tente novamente.";
}
