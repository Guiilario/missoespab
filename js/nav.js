import { auth } from "./firebase.js";
import { saveCheckin } from "./firestore.js";

// Injeta a navegação (top nav no desktop, bottom nav no mobile) dentro de
// #nav-top e #nav-bottom, presentes no HTML de cada página protegida.
// currentPage deve ser um de: "hoje" | "ranking" | "perfil".

const ITEMS = [
  { page: "hoje", href: "index.html", label: "Hoje", icon: homeIcon() },
  { page: "ranking", href: "ranking.html", label: "Ranking", icon: trophyIcon() },
  { page: "checkin", href: "#", id: "btn-nav-checkin", label: "Check-in", icon: checkinIcon() },
  { page: "material", href: "https://guiilario.github.io/kitpab/", label: "Material", icon: materialIcon(), target: "_blank" },
  { page: "perfil", href: "perfil.html", label: "Perfil", icon: userIcon() },
];

export function renderNav(currentPage) {
  const top = document.getElementById("nav-top");
  const bottom = document.getElementById("nav-bottom");

  if (top) {
    top.innerHTML = `
      <div class="nav-top-inner">
        <a href="index.html" class="brand-logo" style="text-decoration:none; font-family: 'Arial Black', Impact, sans-serif; font-size: 24px; font-weight: 900; letter-spacing: -1.5px; line-height: 1;">
          <span style="color: #39FF14;">APP</span><span style="color: #ffffff; font-family: 'Segoe Script', cursive; font-size: 20px; font-weight: 700; margin-left: 1px;">ab</span>
        </a>
        <nav class="nav-top-links">
          ${ITEMS.map(
            (item) => `
            <a href="${item.href}" ${item.id ? `id="${item.id}"` : ""} class="nav-top-link ${
              item.page === currentPage ? "active" : ""
            }" ${item.target ? `target="${item.target}"` : ""}>
              ${item.icon}
              <span class="nav-label-span">${item.label}</span>
            </a>`
          ).join("")}
        </nav>
      </div>
    `;
  }

  if (bottom) {
    bottom.innerHTML = `
      <div class="nav-bottom-inner">
        ${ITEMS.map(
          (item) => `
          <a href="${item.href}" ${item.id ? `id="${item.id}"` : ""} class="nav-bottom-link ${
            item.page === currentPage ? "active" : ""
          }" ${item.target ? `target="${item.target}"` : ""}>
            ${item.icon}
            <span class="nav-label-span">${item.label}</span>
          </a>`
        ).join("")}
      </div>
    `;
  }
}

function homeIcon() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M4 11.5L12 4l8 7.5M6 10v9a1 1 0 001 1h4v-6h2v6h4a1 1 0 001-1v-9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function trophyIcon() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M7 4h10v4a5 5 0 01-10 0V4zM7 5H4v1a3 3 0 003 3M17 5h3v1a3 3 0 01-3 3M12 13v3m-3 4h6m-3 0v-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function userIcon() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="3.5" stroke="currentColor" stroke-width="1.8"/><path d="M5 20c1.2-3.5 4-5 7-5s5.8 1.5 7 5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
}
function materialIcon() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
function checkinIcon() {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="10" r="3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

document.addEventListener("click", async (e) => {
  const btn = e.target.closest("#btn-nav-checkin");
  if (!btn) return;
  e.preventDefault();

  if (!auth.currentUser) {
    alert("Você precisa estar logado para fazer check-in.");
    return;
  }
  
  if ("geolocation" in navigator) {
    const span = btn.querySelector(".nav-label-span");
    const originalText = span ? span.textContent : "Check-in";
    if (span) span.textContent = "Obtendo...";
    
    navigator.geolocation.getCurrentPosition(async (position) => {
      try {
        await saveCheckin(auth.currentUser.uid, position.coords.latitude, position.coords.longitude);
        alert("Check-in realizado com sucesso!");
      } catch (err) {
        console.error("Erro no check-in", err);
        alert("Erro ao salvar check-in.");
      } finally {
        if (span) span.textContent = originalText;
      }
    }, (err) => {
      console.warn(err);
      alert("Ative a localização para fazer o check-in.");
      if (span) span.textContent = originalText;
    }, { enableHighAccuracy: true });
  } else {
    alert("Geolocalização não suportada no seu dispositivo.");
  }
});
