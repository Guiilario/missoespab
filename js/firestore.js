import {
  db,
  doc,
  addDoc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  runTransaction,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  increment,
  arrayUnion,
  arrayRemove,
} from "./firebase.js";

/** Retorna a data atual como YYYY-MM-DD, usada como chave da missão diária. */
export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

// ---------- USUÁRIOS ----------

export async function createUserProfile(uid, { name, username, email }) {
  const ref = doc(db, "users", uid);
  await setDoc(ref, {
    uid,
    name,
    username,
    email,
    disabled: false,
    totalXp: 0,
    completedMissionsCount: 0,
    currentStreak: 0,
    daysCompleted: 0,
    lastCompletedDay: null,
    createdAt: serverTimestamp(),
  });
}

export function subscribeToUserProfile(uid, callback) {
  const ref = doc(db, "users", uid);
  return onSnapshot(ref, (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export async function updateUserProfile(uid, data) {
  const ref = doc(db, "users", uid);
  await updateDoc(ref, data);
}

/** Lista todos os usuários (uso do painel admin). */
export function subscribeToAllUsers(callback) {
  const q = query(collection(db, "users"), orderBy("name"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

/** Ativa/desativa o acesso de um usuário ao app (uso do painel admin). */
export async function setUserDisabled(uid, disabled) {
  await updateDoc(doc(db, "users", uid), { disabled });
}

// ---------- ADMIN ----------

export async function checkIsAdmin(uid) {
  const snap = await getDoc(doc(db, "admins", uid));
  return snap.exists();
}

// ---------- MISSÕES DIÁRIAS ----------
// A missão do dia é global: um único documento por data, valendo pra todos
// os usuários (não é mais por usuário). O admin escolhe as missões do
// catálogo e atribui a uma data pelo painel /admin.html.

/**
 * Assina as missões atribuídas para HOJE (globais, pra todo mundo).
 * dailyAssignments/{YYYY-MM-DD} -> { missionIds: [...] }
 * missions/{missionId} -> { title, description, xpReward, difficulty, imageUrl }
 */
export function subscribeToDailyAssignment(callback) {
  return subscribeToAssignmentForDate(todayKey(), callback);
}

export function subscribeToAssignmentForDate(date, callback) {
  const ref = doc(db, "dailyAssignments", date);
  return onSnapshot(ref, (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

export function subscribeToMission(missionId, callback) {
  const ref = doc(db, "missions", missionId);
  return onSnapshot(ref, (snap) => {
    callback(snap.exists() ? { id: snap.id, ...snap.data() } : null);
  });
}

/** Lista o catálogo inteiro de missões já criadas (uso do painel admin). */
export function subscribeToAllMissions(callback) {
  const q = query(collection(db, "missions"), orderBy("title"));
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

/** Cria uma missão nova no catálogo (uso do painel admin). Retorna o id. */
export async function createMission({ title, description, xpReward, difficulty }) {
  const ref = await addDoc(collection(db, "missions"), {
    title,
    description,
    xpReward: Number(xpReward),
    difficulty,
    imageUrl: "",
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

/** Atribui uma missão (já existente) a uma data — some pra todos os usuários. */
export async function assignMissionToDate(missionId, date) {
  const ref = doc(db, "dailyAssignments", date);
  await setDoc(
    ref,
    { date, missionIds: arrayUnion(missionId) },
    { merge: true }
  );
}

/** Remove uma missão da atribuição de uma data. */
export async function removeMissionFromDate(missionId, date) {
  const ref = doc(db, "dailyAssignments", date);
  await updateDoc(ref, { missionIds: arrayRemove(missionId) });
}

/**
 * Marca uma missão como concluída hoje e concede XP exatamente uma vez.
 * Usa uma transação com id determinístico missionCompletions/{uid}_{missionId}_{date}
 * para que submissões duplicadas (refresh, clique duplo, reconexão) sejam ignoradas.
 */
export async function completeMission(uid, missionId, xpReward) {
  const date = todayKey();
  const completionId = `${uid}_${missionId}_${date}`;
  const completionRef = doc(db, "missionCompletions", completionId);
  const userRef = doc(db, "users", uid);

  await runTransaction(db, async (tx) => {
    const existing = await tx.get(completionRef);
    if (existing.exists()) {
      return; // já recompensado, evita XP duplicado
    }
    tx.set(completionRef, {
      uid,
      missionId,
      date,
      xpAwarded: xpReward,
      completedAt: serverTimestamp(),
    });
    tx.update(userRef, {
      totalXp: increment(xpReward),
      completedMissionsCount: increment(1),
    });
  });
}

export async function getCompletionsForToday(uid, missionIds) {
  const date = todayKey();
  const results = {};
  await Promise.all(
    missionIds.map(async (missionId) => {
      const ref = doc(db, "missionCompletions", `${uid}_${missionId}_${date}`);
      const snap = await getDoc(ref);
      results[missionId] = snap.exists();
    })
  );
  return results;
}

/**
 * Marca o dia como concluído (todas as missões feitas) e atualiza a sequência.
 * Idempotente: só avança a sequência uma vez por dia.
 */
export async function markDayCompleted(uid) {
  const date = todayKey();
  const userRef = doc(db, "users", uid);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists()) return;
    const data = snap.data();
    if (data.lastCompletedDay === date) return; // já marcado hoje

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayKey = yesterday.toISOString().slice(0, 10);

    const continuesStreak = data.lastCompletedDay === yesterdayKey;
    const newStreak = continuesStreak ? (data.currentStreak || 0) + 1 : 1;

    tx.update(userRef, {
      lastCompletedDay: date,
      currentStreak: newStreak,
      daysCompleted: increment(1),
    });
  });
}

// ---------- CONVITES / VOLUNTÁRIOS ----------
// A pessoa convidada se cadastra ela mesma (própria vontade, próprio nome,
// WhatsApp opcional) pela página pública convite.html?u={uid do convidador}.
// Ninguém preenche dado de terceiro sem essa pessoa estar ali, digitando.

/**
 * Cria o registro do voluntário que se cadastrou pelo link de convite.
 * Chamado sem o usuário estar logado (a página convite.html é pública).
 */
export async function createVolunteerReferral(inviterUid, { name, whatsapp }) {
  await addDoc(collection(db, "volunteers"), {
    name: name.trim(),
    whatsapp: (whatsapp || "").trim(),
    inviterUid,
    date: todayKey(),
    createdAt: serverTimestamp(),
  });
}

/** Assina os voluntários que se cadastraram HOJE pelo link deste usuário. */
export function subscribeToTodayReferrals(inviterUid, callback) {
  const q = query(
    collection(db, "volunteers"),
    where("inviterUid", "==", inviterUid),
    where("date", "==", todayKey())
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

/** Assina todos os voluntários já cadastrados pelo link deste usuário. */
export function subscribeToAllReferrals(inviterUid, callback, topN = 50) {
  const q = query(
    collection(db, "volunteers"),
    where("inviterUid", "==", inviterUid),
    orderBy("createdAt", "desc"),
    limit(topN)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
}

// ---------- RANKING ----------

export function subscribeToRanking(callback, topN = 50) {
  const q = query(collection(db, "users"), orderBy("totalXp", "desc"), limit(topN));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d, i) => ({ id: d.id, rank: i + 1, ...d.data() }));
    callback(rows);
  });
}

// ---------- UPLOAD DE FOTOS (Google Drive via Apps Script) ----------

const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyFoI_Sf_wdjVzMcsWISGrF6gLYbwH3ZEiku4bsygeRvQIeuM6Bh6Hn4GSXC-WbFLFT/exec";

/**
 * Faz upload de uma foto para o Google Drive via Google Apps Script.
 * Converte o arquivo para base64 e envia via POST.
 * Retorna a URL pública da imagem.
 */
export async function uploadMissionPhoto(uid, file) {
  const base64 = await fileToBase64(file);
  const response = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    body: JSON.stringify({
      image: base64,
      mimeType: file.type || "image/jpeg",
      fileName: `${uid}_${Date.now()}_${file.name}`,
    }),
  });
  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || "Falha no upload da foto.");
  }
  return result.url;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const base64 = dataUrl.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function completeRepeatableMission(uid, missionId, xpReward, proofData = null) {
  const date = todayKey();
  const timestamp = Date.now();
  const completionId = `${uid}_${missionId}_${date}_${timestamp}`;
  const dailyCompletionId = `${uid}_${missionId}_${date}`;
  
  const dailyCompletionRef = doc(db, "missionCompletions", dailyCompletionId);
  const logRef = doc(db, "missionLogs", completionId);
  const userRef = doc(db, "users", uid);

  await runTransaction(db, async (tx) => {
    // Todas as leituras primeiro (regra do Firestore)
    const existingDaily = await tx.get(dailyCompletionRef);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists()) return;

    // Agora todas as escritas
    tx.set(logRef, {
      uid,
      missionId,
      date,
      xpAwarded: xpReward,
      proofData,
      completedAt: serverTimestamp(),
    });
    
    tx.update(userRef, {
      totalXp: increment(xpReward),
      completedMissionsCount: increment(1),
    });

    if (!existingDaily.exists()) {
      tx.set(dailyCompletionRef, {
        uid,
        missionId,
        date,
        xpAwarded: 0,
        completedAt: serverTimestamp(),
      });
    }
  });
}

export async function completeReferralMission(inviterUid, referralId, xpReward) {
  const date = todayKey();
  const logId = `${inviterUid}_referral_${referralId}`;
  const logRef = doc(db, "missionLogs", logId);
  const userRef = doc(db, "users", inviterUid);

  await runTransaction(db, async (tx) => {
    const existing = await tx.get(logRef);
    if (existing.exists()) return;

    tx.set(logRef, {
      uid: inviterUid,
      referralId,
      date,
      xpAwarded: xpReward,
      completedAt: serverTimestamp(),
    });

    tx.update(userRef, {
      totalXp: increment(xpReward),
      completedMissionsCount: increment(1),
    });
  });
}
