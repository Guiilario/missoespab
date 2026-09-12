// Inclua este script em toda página protegida (index.html, ranking.html, perfil.html).
// Ele mostra um spinner até o Firebase confirmar o estado de login, redireciona
// para entrar.html se não houver usuário, e dispara "auth-ready" com {user, profile}
// quando tudo estiver pronto — cada página escuta esse evento pra montar sua UI.

import { auth, onAuthStateChanged } from "./firebase.js";
import { subscribeToUserProfile } from "./firestore.js";

const overlay = document.createElement("div");
overlay.id = "auth-loading-overlay";
overlay.innerHTML = `<div class="spinner" role="status" aria-label="Carregando"></div>`;
document.body.appendChild(overlay);

let profileUnsub = null;

onAuthStateChanged(auth, (user) => {
  if (!user) {
    if (profileUnsub) profileUnsub();
    window.location.href = "entrar.html";
    return;
  }

  overlay.remove();

  profileUnsub = subscribeToUserProfile(user.uid, (profile) => {
    window.dispatchEvent(
      new CustomEvent("auth-ready", { detail: { user, profile } })
    );
  });
});
