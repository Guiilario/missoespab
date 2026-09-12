import { createVolunteerReferral } from "../firestore.js";

const contentSlot = document.getElementById("content-slot");
const params = new URLSearchParams(window.location.search);
const inviterUid = params.get("u");

if (!inviterUid) {
  showInvalidLink();
} else {
  wireForm();
}

function wireForm() {
  const form = document.getElementById("volunteer-form");
  const nameInput = document.getElementById("name");
  const whatsappInput = document.getElementById("whatsapp");
  const errorMsg = document.getElementById("error-msg");
  const submitBtn = document.getElementById("submit-btn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorMsg.hidden = true;

    const name = nameInput.value.trim();
    if (name.length < 2) {
      errorMsg.textContent = "Digite seu nome completo.";
      errorMsg.hidden = false;
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = "Enviando...";

    try {
      await createVolunteerReferral(inviterUid, {
        name,
        whatsapp: whatsappInput.value.trim(),
      });
      showSuccess(name);
    } catch (err) {
      errorMsg.textContent = "Não foi possível enviar. Verifique sua conexão e tente de novo.";
      errorMsg.hidden = false;
      submitBtn.disabled = false;
      submitBtn.textContent = "Confirmar participação";
    }
  });
}

function showSuccess(name) {
  contentSlot.innerHTML = `
    <div class="auth-header">
      <div class="auth-logo font-display">✓</div>
      <h1 class="font-display">Valeu, ${escapeHtml(name.split(" ")[0])}!</h1>
      <p>Seu cadastro como voluntário foi recebido. Obrigado por participar.</p>
    </div>
  `;
}

function showInvalidLink() {
  contentSlot.innerHTML = `
    <div class="auth-header">
      <div class="auth-logo font-display">!</div>
      <h1 class="font-display">Link inválido</h1>
      <p>Esse link de convite não é válido. Peça pra pessoa que te convidou reenviar o link.</p>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
