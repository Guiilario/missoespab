import {
  db,
  doc,
  addDoc,
  getDoc,
  setDoc,
  updateDoc,
  runTransaction,
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp,
  increment,
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

// ---------- MISSÕES DIÁRIAS ----------

/**
 * Assina as 3 missões atribuídas para hoje.
 * dailyAssignments/{uid}_{todayKey} -> { uid, date, missionIds: [...] }
 * missions/{missionId} -> { title, description, xpReward, difficulty, imageUrl }
 */
export function subscribeToDailyAssignment(uid, callback) {
  const id = `${uid}_${todayKey()}`;
  const ref = doc(db, "dailyAssignments", id);
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
 * Marca o dia como concluído (3 missões feitas) e atualiza a sequência.
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
