import { auth, firebaseConfig, signInWithEmailAndPassword, onAuthStateChanged, signOut, createUserAsAdmin } from "../firebase.js";
import {
  checkIsAdmin,
  createUserProfile,
  subscribeToAllUsers,
  setUserDisabled,
  subscribeToAllMissions,
  createMission,
  assignMissionToDate,
  removeMissionFromDate,
  subscribeToAssignmentForDate,
  subscribeToMission,
  subscribeToRanking,
  todayKey,
  getMissionLogsForUser,
  getVolunteerById,
  getConversionById,
  revokeLog,
  getVolunteersByDate,
  getConversionsByDate,
  getMissionLogsByDate
} from "../firestore.js";

// Não renderiza a nav global — o admin tem sua própria UI

let currentUser = null;
let currentUserRole = "admin";
let allMissionsCatalog = [];
let allUsersCache = [];
let assignmentUnsub = null;
let activeMissionsUnsub = null;
let missionDetailUnsubs = [];
let activeMissionDetailUnsubs = [];
let panfletagemLogsMap = new Map();

// ---------- Tab system ----------
document.getElementById("admin-tabs").addEventListener("click", (e) => {
  const btn = e.target.closest(".admin-tab");
  if (!btn) return;

  const target = btn.dataset.tab;
  if (!target) return;

  // Deactivate all tabs
  document.querySelectorAll(".admin-tab").forEach((b) => b.classList.remove("active"));
  document.querySelectorAll(".admin-tab-content").forEach((c) => c.classList.remove("active"));

  // Activate clicked tab
  btn.classList.add("active");
  const el = document.getElementById(target);
  if (el) {
    el.classList.add("active");
    // Re-trigger animation
    el.style.animation = "none";
    el.offsetHeight; // reflow
    el.style.animation = "";
  }
});

// ---------- Login exclusivo do admin ----------
const loginScreen = document.getElementById("admin-login-screen");
const contentEl = document.getElementById("admin-content");
const loginForm = document.getElementById("admin-login-form");
const loginError = document.getElementById("admin-login-error");
const loginBtn = document.getElementById("admin-login-btn");

let adminInitialized = false;

/**
 * Verifica se o uid é admin via REST API do Firestore.
 * Usa o idToken diretamente, contornando qualquer delay de propagação do SDK.
 */
async function checkIsAdminREST(uid, idToken) {
  const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/admins/${uid}`;
  const res = await fetch(url, {
    headers: { "Authorization": `Bearer ${idToken}` },
  });
  if (res.status === 404) return null;       // documento não existe
  if (res.status === 403) return null;        // sem permissão (não é admin)
  if (!res.ok) return null;                   // qualquer outro erro
  
  const data = await res.json();
  const role = data.fields?.role?.stringValue || "admin";
  return { role };
}

/**
 * Ativa o painel do admin (esconde login, mostra conteúdo).
 */
function activateAdminPanel(user, role = "admin") {
  if (adminInitialized) return;                // evita init duplicado
  adminInitialized = true;
  currentUser = user;
  currentUserRole = role;
  loginScreen.style.display = "none";
  contentEl.hidden = false;
  document.getElementById("admin-session-email").textContent = user.email;
  
  if (role === "auditor") {
    document.querySelector('[data-tab="tab-create-user"]').style.display = 'none';
    document.querySelector('[data-tab="tab-add-mission"]').style.display = 'none';
    document.querySelector('[data-tab="tab-active-missions"]').style.display = 'none';
    document.querySelector('[data-tab="tab-users"]').click();
  }
  
  init();
}

// Auto-login: se o admin já estava logado (sessão persistida), entra direto
onAuthStateChanged(auth, async (user) => {
  if (!user || adminInitialized) return;
  try {
    const idToken = await user.getIdToken(true);
    const adminData = await checkIsAdminREST(user.uid, idToken);
    if (adminData) {
      activateAdminPanel(user, adminData.role);
    } else {
      // Usuário logado mas não é admin — faz signOut silencioso
      await signOut(auth);
    }
  } catch (err) {
    console.warn("Auto-login admin falhou:", err);
  }
});

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.hidden = true;
  loginBtn.disabled = true;
  loginBtn.textContent = "Entrando...";

  const email = document.getElementById("admin-email").value.trim();
  const password = document.getElementById("admin-password").value;

  try {
    // 1. Autentica via REST para obter o idToken sem depender do SDK
    const signInUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${firebaseConfig.apiKey}`;
    const signInRes = await fetch(signInUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
    });
    const signInData = await signInRes.json();

    if (!signInRes.ok) {
      const code = signInData.error?.message || "";
      throw { code: restErrorToAuthCode(code) };
    }

    const uid = signInData.localId;
    const idToken = signInData.idToken;

    // 2. Verifica se é admin via REST (idToken já está disponível)
    const adminData = await checkIsAdminREST(uid, idToken);
    if (!adminData) {
      loginError.textContent = "Essa conta não tem permissão de administrador.";
      loginError.hidden = false;
      return;
    }

    // 3. Agora sim faz o login no SDK (para que os listeners do Firestore funcionem)
    const cred = await signInWithEmailAndPassword(auth, email, password);
    activateAdminPanel(cred.user, adminData.role);
  } catch (err) {
    console.error("Erro no login do admin:", err);
    loginError.textContent = friendlyLoginError(err.code);
    loginError.hidden = false;
  } finally {
    loginBtn.disabled = false;
    loginBtn.textContent = "Entrar";
  }
});

document.getElementById("admin-logout-btn").addEventListener("click", async () => {
  await signOut(auth);
  window.location.reload();
});

function restErrorToAuthCode(msg) {
  if (msg.includes("EMAIL_NOT_FOUND")) return "auth/user-not-found";
  if (msg.includes("INVALID_PASSWORD")) return "auth/wrong-password";
  if (msg.includes("INVALID_LOGIN_CREDENTIALS")) return "auth/invalid-credential";
  if (msg.includes("TOO_MANY_ATTEMPTS")) return "auth/too-many-requests";
  if (msg.includes("INVALID_EMAIL")) return "auth/invalid-email";
  return "auth/unknown";
}

function friendlyLoginError(code) {
  const map = {
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/user-not-found": "Usuário não encontrado.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/too-many-requests": "Muitas tentativas. Tente novamente mais tarde.",
    "auth/invalid-email": "E-mail inválido.",
  };
  return map[code] || "Não foi possível entrar. Tente novamente.";
}

function init() {
  subscribeToAllUsers((users) => {
    allUsersCache = users;
    renderFilteredUsers();
  });
  subscribeToAllMissions((missions) => {
    allMissionsCatalog = missions;
    renderExistingMissionSelect();
  });

  // Data para "Adicionar Missões"
  const dateInput = document.getElementById("assignment-date");
  dateInput.value = todayKey();

  // Data para "Missões Ativas"
  const activeDateInput = document.getElementById("active-missions-date");
  activeDateInput.value = todayKey();
  activeDateInput.addEventListener("change", () => watchActiveDate(activeDateInput.value));
  watchActiveDate(activeDateInput.value);

  // Ranking
  subscribeToRanking(renderAdminRanking);

  // Search filter
  const filterInput = document.getElementById("users-filter");
  filterInput.addEventListener("input", () => renderFilteredUsers());
}

// ---------- Criar usuário ----------
const createUserForm = document.getElementById("create-user-form");
const createUserError = document.getElementById("create-user-error");
const createUserSuccess = document.getElementById("create-user-success");
const createUserBtn = document.getElementById("create-user-btn");

createUserForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  createUserError.hidden = true;
  createUserSuccess.hidden = true;

  const name = document.getElementById("new-name").value.trim();
  const username = document.getElementById("new-username").value.trim();
  const email = document.getElementById("new-email").value.trim();
  const password = document.getElementById("new-password").value;
  const avatar = document.querySelector('input[name="new-avatar"]:checked').value;

  createUserBtn.disabled = true;
  createUserBtn.innerHTML = "Criando...";

  try {
    // A função createUserAsAdmin agora também cria o perfil no Firestore via REST API
    // para contornar qualquer problema de regras de segurança não sincronizadas.
    const uid = await createUserAsAdmin({ name, username, email, password, avatar });

    createUserSuccess.textContent = `Usuário "${name}" criado com sucesso.`;
    createUserSuccess.hidden = false;
    createUserForm.reset();
  } catch (err) {
    createUserError.textContent = err.code ? friendlyAuthError(err.code) : err.message;
    createUserError.hidden = false;
  } finally {
    createUserBtn.disabled = false;
    createUserBtn.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="9" cy="7" r="4" stroke="currentColor" stroke-width="1.8"/><line x1="19" y1="8" x2="19" y2="14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><line x1="22" y1="11" x2="16" y2="11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg> Criar usuário`;
  }
});

function friendlyAuthError(code) {
  const map = {
    "auth/email-already-in-use": "Esse e-mail já está cadastrado.",
    "auth/invalid-email": "E-mail inválido.",
    "auth/weak-password": "A senha é muito fraca (mínimo 6 caracteres).",
  };
  return map[code] || "Não foi possível criar o usuário. Tente de novo.";
}

// ---------- Lista de usuários com filtro ----------
const usersListEl = document.getElementById("users-list");
const usersCountEl = document.getElementById("users-count");
const usersFilterInput = document.getElementById("users-filter");

function renderFilteredUsers() {
  const query = (usersFilterInput?.value || "").toLowerCase().trim();
  let filtered = allUsersCache;

  if (query) {
    filtered = allUsersCache.filter((u) => {
      return (
        (u.name || "").toLowerCase().includes(query) ||
        (u.username || "").toLowerCase().includes(query) ||
        (u.email || "").toLowerCase().includes(query)
      );
    });
  }

  usersCountEl.textContent = `${filtered.length} de ${allUsersCache.length} usuários`;
  renderUsersList(filtered);
}

function renderUsersList(users) {
  if (!users.length) {
    usersListEl.innerHTML = `<p class="admin-empty-msg">Nenhum usuário encontrado.</p>`;
    return;
  }

  const isAuditor = currentUserRole === "auditor";

  usersListEl.innerHTML = users
    .map((u) => {
      const disabled = !!u.disabled;
      return `
        <div class="admin-user-row">
          <div class="admin-user-info">
            <p class="admin-user-name">
              ${escapeHtml(u.name)}
              <span class="admin-status ${disabled ? "disabled" : "active"}">${disabled ? "Desativado" : "Ativo"}</span>
            </p>
            <p class="admin-user-meta">@${escapeHtml(u.username)} · ${escapeHtml(u.email)} · ${u.totalXp || 0} XP</p>
          </div>
          <div class="admin-user-actions">
            <button class="admin-btn-sm" data-view-uid="${u.id}" data-name="${escapeHtml(u.name)}" data-username="${escapeHtml(u.username)}" data-xp="${u.totalXp || 0}">Ver</button>
            ${!isAuditor ? `<button class="admin-btn-sm ${disabled ? "ok" : "danger"}" data-uid="${u.id}" data-disabled="${disabled}">
              ${disabled ? "Reativar" : "Desativar"}
            </button>` : ""}
          </div>
        </div>
      `;
    })
    .join("");
}

usersListEl.addEventListener("click", async (e) => {
  const disableBtn = e.target.closest("button[data-uid]");
  if (disableBtn) {
    const uid = disableBtn.dataset.uid;
    const isCurrentlyDisabled = disableBtn.dataset.disabled === "true";
    disableBtn.disabled = true;
    try {
      await setUserDisabled(uid, !isCurrentlyDisabled);
    } finally {
      disableBtn.disabled = false;
    }
    return;
  }

  const viewBtn = e.target.closest("button[data-view-uid]");
  if (viewBtn) {
    const uid = viewBtn.dataset.viewUid;
    openUserDetails(uid, {
      name: viewBtn.dataset.name,
      username: viewBtn.dataset.username,
      xp: viewBtn.dataset.xp,
    });
  }
});

const userModal = document.getElementById("user-details-modal");
const userModalName = document.getElementById("user-modal-name");
const userModalInfo = document.getElementById("user-modal-info");
const umTabs = document.querySelectorAll("#user-modal-tabs .admin-tab");
const umTabContents = document.querySelectorAll(".um-tab-content");

let currentUserMissions = [];
let currentUserPhotos = [];
let currentUserReferrals = [];
let currentUserConversions = [];

let currentUmTab = "missions";

// Paginação simples (se necessário depois). Por enquanto sem paginação para simplificar.
document.getElementById("user-modal-close")?.addEventListener("click", () => {
  userModal.style.display = "none";
});

umTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    umTabs.forEach((t) => t.classList.remove("active"));
    umTabContents.forEach((c) => (c.style.display = "none"));
    tab.classList.add("active");
    const target = tab.dataset.umTab;
    document.getElementById(`um-tab-${target}`).style.display = "block";
    currentUmTab = target;
  });
});

async function openUserDetails(uid, user) {
  userModalName.textContent = user.name;
  userModalInfo.innerHTML = `@${user.username} &bull; ${user.xp} XP total`;
  
  document.getElementById("user-modal-logs-missions").innerHTML = `<p class="admin-empty-msg">Buscando histórico...</p>`;
  document.getElementById("user-modal-logs-referrals").innerHTML = `<p class="admin-empty-msg">Buscando indicações...</p>`;
  document.getElementById("user-modal-logs-conversions").innerHTML = `<p class="admin-empty-msg">Buscando conversões...</p>`;
  
  // Reseta para primeira aba
  umTabs[0].click();
  userModal.style.display = "flex";

  try {
    const logs = await getMissionLogsForUser(uid);
    currentUserMissions = logs.filter(l => !l.referralId && !l.conversaoId);
    
    const referralLogs = logs.filter(l => !!l.referralId);
    currentUserReferrals = await Promise.all(referralLogs.map(async (log) => {
      const vol = await getVolunteerById(log.referralId);
      return { ...log, volunteerData: vol };
    }));
    
    const conversionLogs = logs.filter(l => !!l.conversaoId);
    currentUserConversions = await Promise.all(conversionLogs.map(async (log) => {
      const conv = await getConversionById(log.conversaoId);
      return { ...log, volunteerData: conv }; // Reuse volunteerData format for UI
    }));
    
    renderMissionsTab();
    renderReferralsTab();
    renderConversionsTab();
  } catch (err) {
    const errorMsg = `<p style="color:red;font-size:0.875rem;">Erro: ${err.message || err.toString()}</p>`;
    document.getElementById("user-modal-logs-missions").innerHTML = errorMsg;
    document.getElementById("user-modal-logs-referrals").innerHTML = errorMsg;
    document.getElementById("user-modal-logs-conversions").innerHTML = errorMsg;
    console.error(err);
  }
}

function renderMissionsTab() {
  const container = document.getElementById("user-modal-logs-missions");
  if (!currentUserMissions.length) {
    container.innerHTML = `<p class="admin-empty-msg">Nenhuma missão concluída.</p>`;
    return;
  }
  container.innerHTML = currentUserMissions.map((log) => buildLogHtml(log)).join("");
  attachLogEvents(container);
}

function renderReferralsTab() {
  const container = document.getElementById("user-modal-logs-referrals");
  if (!currentUserReferrals.length) {
    container.innerHTML = `<p class="admin-empty-msg">Nenhuma indicação registrada.</p>`;
    return;
  }
  container.innerHTML = currentUserReferrals.map((log) => buildLogHtml(log)).join("");
  attachLogEvents(container);
}

function renderConversionsTab() {
  const container = document.getElementById("user-modal-logs-conversions");
  if (!currentUserConversions.length) {
    container.innerHTML = `<p class="admin-empty-msg">Nenhuma conversão registrada.</p>`;
    return;
  }
  container.innerHTML = currentUserConversions.map((log) => {
    // Override the title for Conversions
    const displayLog = { ...log, _overrideTitle: "Conversão de Eleitor" };
    return buildLogHtml(displayLog);
  }).join("");
  attachLogEvents(container);
}

function buildLogHtml(log) {
  const mission = allMissionsCatalog.find((m) => m.id === log.missionId);
  const title = log._overrideTitle || (mission ? mission.title : (log.referralId ? "Indicação de eleitor" : log.missionId));
  const dateStr = log.completedAt?.toDate ? log.completedAt.toDate().toLocaleString("pt-BR") : log.date;
  
  let proofHtml = "";
  if (log.proofData) {
    proofHtml += `<div style="margin-top:0.5rem;padding:0.5rem;background:#f5f5f5;border-radius:0.5rem;font-size:0.875rem;">`;
    if (log.proofData.local) proofHtml += `<p style="margin:0 0 0.25rem;"><strong>Local:</strong> ${escapeHtml(log.proofData.local)}</p>`;
    if (log.proofData.referencia) proofHtml += `<p style="margin:0 0 0.25rem;"><strong>Ref:</strong> ${escapeHtml(log.proofData.referencia)}</p>`;
    if (log.proofData.localInicio) {
      if (log.proofData.trackPoints && log.proofData.trackPoints.length > 0) {
        const pts = log.proofData.trackPoints;
        const startTime = pts[0].time;
        const endTime = pts[pts.length - 1].time;
        const dist = log.proofData.distanceKm || 0;
        const mapId = Math.random().toString(36).substring(7);
        panfletagemLogsMap.set(mapId, pts);
        proofHtml += `<div style="display:flex;justify-content:space-between;align-items:center;margin:0 0 0.25rem;">
          <p style="margin:0;"><strong>Início:</strong> ${escapeHtml(log.proofData.localInicio)}</p>
          <button type="button" class="btn-view-panfletagem" data-start="${startTime}" data-end="${endTime}" data-dist="${dist}" data-map-id="${mapId}" style="color:var(--brand);background:none;border:none;padding:0;font-weight:600;cursor:pointer;font-size:0.875rem;">Ver Detalhes</button>
        </div>`;
      } else {
        proofHtml += `<p style="margin:0 0 0.25rem;"><strong>Início:</strong> ${escapeHtml(log.proofData.localInicio)}</p>`;
      }
    }
    if (log.proofData.postLink) {
      let formattedLink = log.proofData.postLink;
      if (!/^https?:\/\//i.test(formattedLink)) {
        formattedLink = 'https://' + formattedLink;
      }
      proofHtml += `<a href="${formattedLink}" target="_blank" style="display:inline-block;margin-top:0.5rem;color:var(--brand);font-weight:600;font-size:0.875rem;text-decoration:none;">Visualizar postagem &rarr;</a>`;
    }
    if (log.proofData.photoUrl) {
      proofHtml += `<button type="button" class="btn-view-photo" data-url="${log.proofData.photoUrl}" style="margin-top:0.5rem;color:var(--brand);background:none;border:none;padding:0;font-weight:600;cursor:pointer;font-size:0.875rem;">Ver Foto &rarr;</button>`;
    }
    proofHtml += `</div>`;
  }
  
  if (log.volunteerData) {
    const vol = log.volunteerData;
    proofHtml += `<div style="margin-top:0.5rem;padding:0.5rem;background:#f5f5f5;border-radius:0.5rem;font-size:0.875rem;">`;
    proofHtml += `<p style="margin:0 0 0.25rem;"><strong>Nome:</strong> ${escapeHtml(vol.name)}</p>`;
    if (vol.whatsapp) {
      proofHtml += `<p style="margin:0 0 0.25rem;"><strong>WhatsApp:</strong> ${escapeHtml(vol.whatsapp)}</p>`;
      const cleanWpp = vol.whatsapp.replace(/\D/g, '');
      if (cleanWpp) {
        proofHtml += `<a href="https://wa.me/55${cleanWpp.startsWith('55') ? cleanWpp.slice(2) : cleanWpp}" target="_blank" style="display:inline-block;margin-top:0.25rem;padding:0.35rem 0.6rem;background:#25D366;color:#fff;text-decoration:none;border-radius:0.25rem;font-size:0.75rem;font-weight:bold;">💬 Chamar no WhatsApp</a>`;
      }
    }
    proofHtml += `</div>`;
  }
  
  return `
    <div style="border-bottom:1px solid #eee;padding:1rem 0;">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <strong style="display:block;margin-bottom:0.25rem;">${escapeHtml(title)}</strong>
          <span style="font-size:0.75rem;color:#666;">${dateStr}</span>
        </div>
        <div style="text-align:right;">
          <span style="display:block;font-size:0.875rem;font-weight:600;color:var(--mint);margin-bottom:0.25rem;">+${log.xpAwarded} XP</span>
          ${currentUserRole !== "auditor" ? `<button class="btn-delete-log admin-btn-sm danger" style="padding:0.2rem 0.4rem;font-size:0.65rem;" data-log='${escapeHtml(JSON.stringify({id: log.id, _collection: log._collection, uid: log.uid, xpAwarded: log.xpAwarded, conversaoId: log.conversaoId, referralId: log.referralId}))}'>Revogar</button>` : ""}
        </div>
      </div>
      ${proofHtml}
    </div>
  `;
}

function attachLogEvents(container) {
  const photoBtns = container.querySelectorAll(".btn-view-photo");
  photoBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      const url = e.target.dataset.url;
      openPhotoPopup(url);
    });
  });

  const panfBtns = container.querySelectorAll(".btn-view-panfletagem");
  panfBtns.forEach(btn => {
    btn.addEventListener("click", (e) => {
      const start = parseInt(e.target.dataset.start);
      const end = parseInt(e.target.dataset.end);
      const dist = parseFloat(e.target.dataset.dist);
      const mapId = e.target.dataset.mapId;
      const pts = panfletagemLogsMap.get(mapId) || [];
      openPanfletagemPopup(start, end, dist, pts);
    });
  });

  const deleteBtns = container.querySelectorAll(".btn-delete-log");
  deleteBtns.forEach(btn => {
    btn.addEventListener("click", async (e) => {
      if (!confirm("Tem certeza que deseja revogar esta ação e deduzir o XP do usuário? Isso apagará todos os dados associados a ela.")) return;
      
      const btnEl = e.target;
      const logData = JSON.parse(btnEl.dataset.log || "{}");
      if (!logData.id) return;
      
      btnEl.disabled = true;
      btnEl.textContent = "Revogando...";
      
      try {
        await revokeLog(logData);
        // Remove from UI
        btnEl.closest("div[style*='border-bottom']").remove();
        // Update user xp in memory just for the modal info text
        const userUid = logData.uid;
        if (userUid) {
          const matchUser = allUsersCache.find(u => u.id === userUid);
          if (matchUser) {
            matchUser.totalXp -= logData.xpAwarded;
            document.getElementById("user-modal-info").innerHTML = `@${matchUser.username} &bull; ${matchUser.totalXp} XP total`;
          }
        }
      } catch (err) {
        console.error("Erro ao revogar:", err);
        alert("Não foi possível revogar: " + err.message);
        btnEl.disabled = false;
        btnEl.textContent = "Revogar";
      }
    });
  });
}

function openPhotoPopup(url) {
  const overlay = document.createElement("div");
  overlay.style.cssText = "display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:10000;align-items:center;justify-content:center;padding:1rem;";
  overlay.innerHTML = `
    <div style="position:relative;max-width:100%;max-height:100%;display:flex;flex-direction:column;align-items:center;">
      <button style="position:absolute;top:-2rem;right:0;background:none;border:none;color:#fff;font-size:2rem;cursor:pointer;">&times;</button>
      <img src="${url}" style="max-width:100%;max-height:85vh;border-radius:0.5rem;box-shadow:0 10px 25px rgba(0,0,0,0.5);" />
    </div>
  `;
  document.body.appendChild(overlay);
  
  overlay.addEventListener("click", (e) => {
    if (e.target.tagName !== 'IMG') {
      overlay.remove();
    }
  });
}

function openPanfletagemPopup(start, end, dist, pts) {
  const overlay = document.createElement("div");
  overlay.style.cssText = "display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:10000;align-items:center;justify-content:center;padding:1rem;";
  
  const startStr = new Date(start).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' });
  const endStr = new Date(end).toLocaleTimeString("pt-BR", { hour: '2-digit', minute: '2-digit' });
  
  overlay.innerHTML = `
    <div style="background:#fff;border-radius:1rem;padding:1.5rem;max-width:320px;width:100%;box-shadow:0 10px 25px rgba(0,0,0,0.2);position:relative;color:#333;display:flex;flex-direction:column;max-height:90vh;">
      <button class="close-panfletagem-btn" style="position:absolute;top:1rem;right:1rem;background:none;border:none;font-size:1.5rem;cursor:pointer;color:#666;line-height:1;z-index:10;">&times;</button>
      <h3 style="margin:0 0 1rem;font-size:1.1rem;color:#111;flex-shrink:0;">Detalhes da Panfletagem</h3>
      <div style="font-size:0.9rem;line-height:1.6;flex-shrink:0;">
        <p style="margin:0;"><strong>Início:</strong> ${startStr}</p>
        <p style="margin:0;"><strong>Fim:</strong> ${endStr}</p>
        <p style="margin:0;"><strong>Distância:</strong> ${dist.toFixed(2)} km</p>
      </div>
      <div id="panfletagem-map-container" style="margin-top:1rem;height:150px;border-radius:0.5rem;overflow:hidden;background:#eee;position:relative;cursor:pointer;">
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  
  const mapContainer = overlay.querySelector('#panfletagem-map-container');
  const closeBtn = overlay.querySelector('.close-panfletagem-btn');
  
  let map = null;
  if (window.L && pts && pts.length > 0) {
    map = L.map(mapContainer, { zoomControl: false }).setView([pts[0].lat, pts[0].lng], 15);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
    }).addTo(map);
    
    const latlngs = pts.map(p => [p.lat, p.lng]);
    const polyline = L.polyline(latlngs, {color: '#0A33E1', weight: 4}).addTo(map);
    map.fitBounds(polyline.getBounds(), { padding: [10, 10] });

    // Open large map in a new popup on click
    mapContainer.addEventListener("click", () => {
      const largeOverlay = document.createElement("div");
      largeOverlay.style.cssText = "display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.8);z-index:10001;align-items:center;justify-content:center;padding:1rem;";
      
      largeOverlay.innerHTML = `
        <div style="background:#fff;border-radius:1rem;padding:1rem;max-width:800px;width:100%;box-shadow:0 10px 25px rgba(0,0,0,0.5);position:relative;">
          <button class="close-large-map-btn" style="position:absolute;top:-2.5rem;right:0;background:none;border:none;font-size:2.5rem;cursor:pointer;color:#fff;line-height:1;z-index:10;">&times;</button>
          <div id="large-map-container" style="width:100%;aspect-ratio:16/9;border-radius:0.5rem;overflow:hidden;background:#eee;"></div>
        </div>
      `;
      document.body.appendChild(largeOverlay);
      
      const largeMapContainer = largeOverlay.querySelector('#large-map-container');
      const largeMap = L.map(largeMapContainer, { zoomControl: true }).setView([pts[0].lat, pts[0].lng], 15);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
      }).addTo(largeMap);
      
      const largePolyline = L.polyline(latlngs, {color: '#0A33E1', weight: 4}).addTo(largeMap);
      largeMap.fitBounds(largePolyline.getBounds(), { padding: [20, 20] });
      
      largeOverlay.querySelector('.close-large-map-btn').addEventListener("click", () => {
        largeMap.remove();
        largeOverlay.remove();
      });
      
      largeOverlay.addEventListener("click", (e) => {
        if (e.target === largeOverlay) {
          largeMap.remove();
          largeOverlay.remove();
        }
      });
    });
  } else {
    mapContainer.innerHTML = '<p style="text-align:center;padding:1rem;color:#666;font-size:0.875rem;">Mapa indisponível</p>';
  }
  
  closeBtn.addEventListener("click", () => {
    if (map) map.remove();
    overlay.remove();
  });
  
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      if (map) map.remove();
      overlay.remove();
    }
  });
}

// ---------- Adicionar Missões ----------
const existingMissionSelect = document.getElementById("existing-mission-select");
const assignExistingBtn = document.getElementById("assign-existing-btn");
const createMissionForm = document.getElementById("create-mission-form");
const createMissionError = document.getElementById("create-mission-error");
const createMissionSuccess = document.getElementById("create-mission-success");
const createMissionBtn = document.getElementById("create-mission-btn");

function renderExistingMissionSelect() {
  existingMissionSelect.innerHTML = allMissionsCatalog
    .map((m) => `<option value="${m.id}">${escapeHtml(m.title)} (+${m.xpReward} XP)</option>`)
    .join("");
}

assignExistingBtn.addEventListener("click", async () => {
  const missionId = existingMissionSelect.value;
  const date = document.getElementById("assignment-date").value;
  if (!missionId || !date) return;
  assignExistingBtn.disabled = true;
  try {
    await assignMissionToDate(missionId, date);
  } finally {
    assignExistingBtn.disabled = false;
  }
});

createMissionForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  createMissionError.hidden = true;
  createMissionSuccess.hidden = true;

  const date = document.getElementById("assignment-date").value;
  if (!date) {
    createMissionError.textContent = "Escolha uma data primeiro.";
    createMissionError.hidden = false;
    return;
  }

  createMissionBtn.disabled = true;
  createMissionBtn.textContent = "Criando...";

  try {
    const missionId = await createMission({
      title: document.getElementById("mission-title").value.trim(),
      description: document.getElementById("mission-description").value.trim(),
      xpReward: document.getElementById("mission-xp").value,
      difficulty: document.getElementById("mission-difficulty").value,
      registro: document.getElementById("mission-registro").value,
    });
    await assignMissionToDate(missionId, date);
    createMissionSuccess.textContent = "Missão criada e atribuída.";
    createMissionSuccess.hidden = false;
    createMissionForm.reset();
    document.getElementById("mission-xp").value = 150;
  } catch (err) {
    createMissionError.textContent = "Não foi possível criar a missão. Tente de novo.";
    createMissionError.hidden = false;
  } finally {
    createMissionBtn.disabled = false;
    createMissionBtn.textContent = "Criar e atribuir a essa data";
  }
});

// ---------- Missões Ativas ----------
const assignedMissionsListEl = document.getElementById("assigned-missions-list");

function watchActiveDate(date) {
  if (activeMissionsUnsub) activeMissionsUnsub();
  activeMissionDetailUnsubs.forEach((u) => u());
  activeMissionDetailUnsubs = [];

  activeMissionsUnsub = subscribeToAssignmentForDate(date, (assignment) => {
    renderAssignedMissions(date, assignment?.missionIds || []);
  });
}

function renderAssignedMissions(date, missionIds) {
  activeMissionDetailUnsubs.forEach((u) => u());
  activeMissionDetailUnsubs = [];

  if (!missionIds.length) {
    assignedMissionsListEl.innerHTML = `<p class="admin-empty-msg">Nenhuma missão atribuída nessa data.</p>`;
    return;
  }

  const details = {};
  assignedMissionsListEl.innerHTML = `<p class="admin-empty-msg">Carregando...</p>`;

  missionIds.forEach((id) => {
    const unsub = subscribeToMission(id, (mission) => {
      details[id] = mission;
      if (Object.keys(details).length === missionIds.length) {
        paintAssignedList(date, missionIds, details);
      }
    });
    activeMissionDetailUnsubs.push(unsub);
  });
}

function paintAssignedList(date, missionIds, details) {
  assignedMissionsListEl.innerHTML = missionIds
    .map((id) => {
      const m = details[id];
      if (!m) return "";
      return `
        <div class="admin-mission-row">
          <div>
            <p class="admin-mission-name">${escapeHtml(m.title)}</p>
            <p class="admin-mission-meta">+${m.xpReward} XP · ${escapeHtml(m.difficulty)}</p>
          </div>
          <div>
            <button class="admin-btn-sm danger" data-remove-id="${id}" data-date="${date}">Remover</button>
          </div>
        </div>
      `;
    })
    .join("");
}

assignedMissionsListEl.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-remove-id]");
  if (!btn) return;
  btn.disabled = true;
  try {
    await removeMissionFromDate(btn.dataset.removeId, btn.dataset.date);
  } catch (error) {
    console.error("Erro ao remover missão:", error);
    alert("Erro ao remover missão: " + error.message);
  } finally {
    btn.disabled = false;
  }
});

// ---------- Ranking no admin ----------
const MEDALS = ["🥇", "🥈", "🥉"];
const adminRankingTable = document.getElementById("admin-ranking-table");

function renderAdminRanking(rows) {
  if (!rows.length) {
    adminRankingTable.innerHTML = `<p class="admin-empty-msg">Ninguém no ranking ainda.</p>`;
    return;
  }

  adminRankingTable.innerHTML = rows
    .map((row) => {
      const medal = MEDALS[row.rank - 1] || row.rank;
      return `
        <div class="admin-rank-row">
          <div class="admin-rank-left">
            <span class="admin-rank-position">${medal}</span>
            <div class="admin-rank-avatar"><img src="assets/${row.avatar || 'avatar-default.svg'}" alt="" /></div>
            <div>
              <p class="admin-rank-name">${escapeHtml(row.name)}</p>
              <p class="admin-rank-username">@${escapeHtml(row.username)}</p>
            </div>
          </div>
          <span class="admin-rank-xp">${(row.totalXp || 0).toLocaleString("pt-BR")} XP</span>
        </div>
      `;
    })
    .join("");
}

// ---------- Helpers ----------
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str ?? "";
  return div.innerHTML;
}

// ---------- Exportação de Dados ----------
const btnExportCsv = document.getElementById("btn-export-csv");
const btnExportHtml = document.getElementById("btn-export-html");
const exportMsg = document.getElementById("export-msg");

function showExportMsg(msg, isError = false) {
  if (!exportMsg) return;
  exportMsg.textContent = msg;
  exportMsg.style.color = isError ? "red" : "var(--brand)";
  exportMsg.hidden = false;
  setTimeout(() => { exportMsg.hidden = true; }, 5000);
}

function getExportDate() {
  const d = document.getElementById("export-date")?.value;
  return d || null;
}

btnExportCsv?.addEventListener("click", async () => {
  try {
    btnExportCsv.disabled = true;
    showExportMsg("Buscando dados...", false);
    
    const date = getExportDate();
    const vols = await getVolunteersByDate(date);
    const convs = await getConversionsByDate(date);
    const logs = await getMissionLogsByDate(date);
    
    const allContacts = [];
    
    // Indicações e Conversões
    vols.forEach(v => allContacts.push({ name: v.name, wpp: v.whatsapp, type: "Indicação Convide um amigo", date: v.date, detail: "", user: "" }));
    convs.forEach(c => allContacts.push({ name: c.name, wpp: c.whatsapp, type: "Conversão de Eleitor", date: c.date, detail: "", user: "" }));
    
    // Outras Missões (Comprovantes)
    for (const log of logs) {
      if (!log.proofData && !log.referralId && !log.conversaoId) continue;
      
      const mission = allMissionsCatalog.find(m => m.id === log.missionId);
      const title = log.conversaoId ? "Conversão de Eleitor" : (log.referralId ? "Indicação Convide um amigo" : (mission?.title || log.missionId));
      const user = allUsersCache.find(u => u.id === log.uid) || { name: 'Desconhecido' };
      const dateStr = log.completedAt?.toDate ? log.completedAt.toDate().toLocaleString("pt-BR") : log.date;
      
      let detail = "";
      if (log.proofData) {
        if (log.proofData.photoUrl) detail = log.proofData.photoUrl;
        else if (log.proofData.postLink) detail = log.proofData.postLink;
        else if (log.proofData.localInicio) detail = `Panfletagem: ${log.proofData.localInicio} (${(log.proofData.distanceKm||0).toFixed(2)} km)`;
        else if (log.proofData.local) detail = `Local: ${log.proofData.local}`;
      }
      
      // Se não for indicação pura, joga na lista (as indicações já pegamos acima, mas as fotos e panfletagens ficam aqui)
      if (!log.referralId && !log.conversaoId) {
        allContacts.push({ name: "-", wpp: "-", type: title, date: dateStr, detail: detail, user: user.name });
      }
    }
    
    if (allContacts.length === 0) {
      showExportMsg("Nenhum dado encontrado para esta data.", true);
      return;
    }
    
    // Header
    let csv = "Nome Contato;WhatsApp;Missao / Origem;Detalhe (Link / Foto);Usuario Executor;Data\n";
    allContacts.forEach(c => {
      const name = (c.name || "").replace(/;/g, " ");
      const wpp = c.wpp || "";
      const type = (c.type || "").replace(/;/g, " ");
      const detail = (c.detail || "").replace(/;/g, " ");
      const user = (c.user || "").replace(/;/g, " ");
      const dataStr = (c.date || "").replace(/;/g, " ");
      
      csv += `${name};${wpp};${type};${detail};${user};${dataStr}\n`;
    });
    
    // BOM para o Excel ler acentos
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `contatos_pab_${date || 'todos'}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showExportMsg("Arquivo CSV baixado com sucesso!");
  } catch (err) {
    console.error("Erro ao exportar CSV:", err);
    showExportMsg("Erro ao exportar CSV.", true);
  } finally {
    btnExportCsv.disabled = false;
  }
});

btnExportHtml?.addEventListener("click", async () => {
  try {
    btnExportHtml.disabled = true;
    showExportMsg("Gerando relatório visual...", false);
    
    const date = getExportDate();
    const logs = await getMissionLogsByDate(date);
    
    // Filtra apenas missões que geraram algum tipo de prova material ou indicação
    const proofLogs = logs.filter(l => l.proofData || l.referralId || l.conversaoId);
    
    if (proofLogs.length === 0) {
      showExportMsg("Nenhuma ação com comprovante encontrada para esta data.", true);
      return;
    }
    
    let htmlContent = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>Relatório Visual de Comprovantes - ${date || 'Geral'}</title>
        <style>
          body { font-family: 'Arial', sans-serif; background: #f8fafc; color: #1e293b; margin: 0; padding: 2rem; }
          .container { max-width: 1000px; margin: 0 auto; background: #fff; padding: 2rem; border-radius: 12px; box-shadow: 0 4px 6px rgba(0,0,0,0.05); }
          .header { border-bottom: 2px solid #e2e8f0; padding-bottom: 1rem; margin-bottom: 2rem; }
          h1 { margin: 0 0 0.5rem; color: #0f172a; font-size: 1.75rem; }
          .item-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 1.5rem; margin-bottom: 1.5rem; background: #fdfdfd; }
          .item-title { font-weight: bold; font-size: 1.2rem; color: #0A33E1; margin: 0 0 0.5rem; }
          .meta-info { font-size: 0.9rem; color: #64748b; margin-bottom: 1rem; }
          .proof-box { background: #f1f5f9; padding: 1rem; border-radius: 6px; }
          img.proof-photo { max-width: 100%; max-height: 400px; border-radius: 4px; margin-top: 0.5rem; display: block; }
          a.btn-link { display: inline-block; background: #0A33E1; color: #fff; padding: 0.5rem 1rem; text-decoration: none; border-radius: 4px; font-weight: bold; margin-top: 0.5rem; }
          .highlight { font-weight: 600; color: #0f172a; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Relatório de Comprovantes</h1>
            <p>Data do filtro: <strong>${date ? date.split('-').reverse().join('/') : 'Histórico completo'}</strong></p>
            <p>Total de registros com prova: <strong>${proofLogs.length}</strong></p>
          </div>
    `;
    
    for (const log of proofLogs) {
      // Find mission title
      const mission = allMissionsCatalog.find(m => m.id === log.missionId);
      const title = log.conversaoId ? "Conversão de Eleitor" : (log.referralId ? "Indicação Convide um amigo" : (mission?.title || log.missionId));
      
      // Find user name (cache search)
      const user = allUsersCache.find(u => u.id === log.uid) || { name: 'Usuário não encontrado', username: log.uid };
      const dateStr = log.completedAt?.toDate ? log.completedAt.toDate().toLocaleString("pt-BR") : log.date;
      
      htmlContent += `
          <div class="item-card">
            <h3 class="item-title">${escapeHtml(title)}</h3>
            <p class="meta-info">Feito por: <span class="highlight">${escapeHtml(user.name)}</span> (@${escapeHtml(user.username)}) em ${dateStr}</p>
            <div class="proof-box">
      `;
      
      if (log.proofData) {
        const pd = log.proofData;
        if (pd.local) htmlContent += `<p><strong>Local:</strong> ${escapeHtml(pd.local)}</p>`;
        if (pd.referencia) htmlContent += `<p><strong>Referência:</strong> ${escapeHtml(pd.referencia)}</p>`;
        if (pd.localInicio) htmlContent += `<p><strong>Início/Região (Panfletagem):</strong> ${escapeHtml(pd.localInicio)}</p>`;
        if (pd.distanceKm) htmlContent += `<p><strong>Distância percorrida:</strong> ${pd.distanceKm.toFixed(2)} km</p>`;
        
        if (pd.postLink) {
          let link = pd.postLink;
          if (!/^https?:\/\//i.test(link)) link = 'https://' + link;
          htmlContent += `<a href="${link}" target="_blank" class="btn-link">Visualizar Publicação</a>`;
        }
        
        if (pd.photoUrl) {
          htmlContent += `<p style="margin-top:1rem;margin-bottom:0.25rem;"><strong>Foto da Ação:</strong></p>
          <img src="${pd.photoUrl}" class="proof-photo" alt="Comprovante de foto" />`;
        }
      }
      
      if (log.referralId || log.conversaoId) {
        let vol = null;
        if (log.referralId) vol = await getVolunteerById(log.referralId);
        if (log.conversaoId) vol = await getConversionById(log.conversaoId);
        
        if (vol) {
           htmlContent += `<p><strong>Nome do contato:</strong> ${escapeHtml(vol.name)}</p>`;
           htmlContent += `<p><strong>WhatsApp:</strong> ${escapeHtml(vol.whatsapp)}</p>`;
        }
      }
      
      htmlContent += `
            </div>
          </div>
      `;
    }
    
    htmlContent += `
        </div>
      </body>
      </html>
    `;
    
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `relatorio_pab_${date || 'todos'}.html`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showExportMsg("Relatório HTML gerado e baixado!");
  } catch (err) {
    console.error("Erro ao exportar HTML:", err);
    showExportMsg("Erro ao gerar relatório HTML.", true);
  } finally {
    btnExportHtml.disabled = false;
  }
});
