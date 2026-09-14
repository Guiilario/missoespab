import { renderNav } from "../nav.js";
import { subscribeToRanking } from "../firestore.js";

renderNav("ranking");

const MEDALS = ["🥇", "🥈", "🥉"];
const tableEl = document.getElementById("ranking-table");
const myPositionSlot = document.getElementById("my-position-slot");

let currentUid = null;

window.addEventListener("auth-ready", (e) => {
  currentUid = e.detail.user.uid;
}, { once: true });

subscribeToRanking((rows) => {
  renderRanking(rows);
});

function renderRanking(rows) {
  if (!rows.length) {
    tableEl.innerHTML = `<p class="rank-empty">Ninguém no ranking ainda.</p>`;
    myPositionSlot.innerHTML = "";
    return;
  }

  tableEl.innerHTML = rows.map((row) => rankRowHtml(row)).join("");

  const myRow = rows.find((r) => r.id === currentUid);
  if (!myRow) {
    myPositionSlot.innerHTML = `
      <div class="my-position-card">
        <p class="eyebrow">Sua posição</p>
        <p class="desc">Continue completando missões para subir no ranking.</p>
      </div>
    `;
  } else {
    myPositionSlot.innerHTML = "";
  }
}

function rankRowHtml(row) {
  const isMe = row.id === currentUid;
  const medal = MEDALS[row.rank - 1] || row.rank;

  return `
    <div class="rank-row ${isMe ? "me" : ""}">
      <div class="rank-row-left">
        <span class="rank-medal">${medal}</span>
        <div class="rank-avatar"><img src="assets/${row.avatar || 'avatar-default.svg'}" alt="" /></div>
        <div>
          <p class="rank-name ${isMe ? "me" : ""}">
            ${escapeHtml(row.name)} ${isMe ? '<span class="you-tag">(você)</span>' : ""}
          </p>
          <p class="rank-username">@${escapeHtml(row.username)}</p>
        </div>
      </div>
      <span class="rank-xp">${(row.totalXp || 0).toLocaleString("pt-BR")} XP</span>
    </div>
  `;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}
