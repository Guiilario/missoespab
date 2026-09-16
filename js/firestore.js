import {
  db,
  doc,
  addDoc,
  getDoc,
  getDocs,
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
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
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

/** Retorna todos os logs de missões concluídas por um usuário (para o admin). */
export async function getMissionLogsForUser(uid) {
  // Pega logs detalhados (missões com foto e indicações)
  const qLogs = query(collection(db, "missionLogs"), where("uid", "==", uid));
  const snapLogs = await getDocs(qLogs);
  let logs = snapLogs.docs.map((d) => ({ id: d.id, _collection: "missionLogs", ...d.data() }));

  // Pega missões diárias simples
  const qCompletions = query(collection(db, "missionCompletions"), where("uid", "==", uid));
  const snapCompletions = await getDocs(qCompletions);
  const completions = snapCompletions.docs
    .map((d) => ({ id: d.id, _collection: "missionCompletions", ...d.data() }))
    // As repetíveis marcam xpAwarded = 0 em missionCompletions, então filtramos
    .filter((c) => c.xpAwarded > 0);

  logs = [...logs, ...completions];

  // Ordena por data mais recente primeiro
  logs.sort((a, b) => {
    const timeA = a.completedAt?.toMillis ? a.completedAt.toMillis() : 0;
    const timeB = b.completedAt?.toMillis ? b.completedAt.toMillis() : 0;
    return timeB - timeA;
  });
  return logs;
}

/** Ativa/desativa o acesso de um usuário ao app (uso do painel admin). */
export async function setUserDisabled(uid, disabled) {
  await updateDoc(doc(db, "users", uid), { disabled });
}

/** Revoga uma missão, indicação ou conversão e deduz XP (uso do painel admin). */
export async function revokeLog(log) {
  if (!log || !log.id || !log._collection) return;
  const logRef = doc(db, log._collection, log.id);
  const userRef = doc(db, "users", log.uid);

  await runTransaction(db, async (tx) => {
    const userSnap = await tx.get(userRef);
    if (userSnap.exists()) {
      tx.update(userRef, {
        totalXp: increment(-log.xpAwarded),
        completedMissionsCount: increment(-1),
      });
    }
    tx.delete(logRef);
    
    if (log.conversaoId) {
      tx.delete(doc(db, "conversoes", log.conversaoId));
    }
    if (log.referralId) {
      tx.delete(doc(db, "volunteers", log.referralId));
    }
  });
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
export async function createMission({ title, description, xpReward, difficulty, registro }) {
  const ref = await addDoc(collection(db, "missions"), {
    title,
    description,
    xpReward: Number(xpReward),
    difficulty,
    registro: registro || "none",
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
 * Valida e formata um número de celular brasileiro.
 * Regras: Apenas números, remove "55" inicial se tiver 13 dígitos, 
 * exige 11 dígitos, impede números sequenciais/repetidos, e exige que inicie com 9 após o DDD.
 */
export function validateAndFormatPhone(rawPhone) {
  let digits = (rawPhone || "").replace(/\D/g, "");
  
  if (digits.startsWith("55") && digits.length === 13) {
    digits = digits.substring(2);
  }
  
  if (digits.length !== 11) {
    throw new Error("O número deve conter exatamente 11 dígitos (DDD + 9 + 8 números). Ex: 11999999999");
  }
  
  if (/^(\d)\1+$/.test(digits)) {
    throw new Error("Número inválido (não pode ter todos os números repetidos).");
  }
  
  if (digits[2] !== "9") {
    throw new Error("O número deve ser um celular (o terceiro dígito deve ser 9).");
  }
  
  return digits;
}

/**
 * Cria o registro do voluntário que se cadastrou pelo link de convite.
 * Chamado sem o usuário estar logado (a página convite.html é pública).
 */
export async function createVolunteerReferral(inviterUid, { name, whatsapp }) {
  const phone = validateAndFormatPhone(whatsapp);

  const q = query(collection(db, "volunteers"), where("whatsapp", "==", phone));
  const snap = await getDocs(q);
  if (!snap.empty) {
    throw new Error("Este número de WhatsApp já foi indicado.");
  }

  await addDoc(collection(db, "volunteers"), {
    name: name.trim(),
    whatsapp: phone,
    inviterUid,
    date: todayKey(),
    createdAt: serverTimestamp(),
  });
}

export async function getVolunteerById(id) {
  const snap = await getDoc(doc(db, "volunteers", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
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

// ---------- CONVERSÕES ----------
export async function createConversion(uid, missionId, xpReward, conversionData) {
  const phone = validateAndFormatPhone(conversionData.whatsapp);

  const q = query(collection(db, "conversoes"), where("whatsapp", "==", phone));
  const snap = await getDocs(q);
  if (!snap.empty) {
    throw new Error("Este número de WhatsApp já foi registrado em outra conversão.");
  }

  const date = todayKey();
  const timestamp = Date.now();
  const completionId = `${uid}_${missionId}_${date}_${timestamp}`;
  const dailyCompletionId = `${uid}_${missionId}_${date}`;
  
  const dailyCompletionRef = doc(db, "missionCompletions", dailyCompletionId);
  const logRef = doc(db, "missionLogs", completionId);
  const userRef = doc(db, "users", uid);

  // We also create a record in conversoes collection
  const conversaoRef = doc(collection(db, "conversoes"));

  await runTransaction(db, async (tx) => {
    const existingDaily = await tx.get(dailyCompletionRef);
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists()) return;

    tx.set(logRef, {
      uid,
      missionId,
      date,
      xpAwarded: xpReward,
      conversaoId: conversaoRef.id,
      completedAt: serverTimestamp(),
    });
    
    tx.set(conversaoRef, {
      uid,
      name: conversionData.name.trim(),
      whatsapp: phone,
      date,
      createdAt: serverTimestamp(),
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

export async function getConversionById(id) {
  const snap = await getDoc(doc(db, "conversoes", id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ---------- EXPORTAÇÃO ----------

export async function getVolunteersByDate(dateStr) {
  let q;
  if (dateStr) {
    q = query(collection(db, "volunteers"), where("date", "==", dateStr));
  } else {
    q = query(collection(db, "volunteers"));
  }
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getConversionsByDate(dateStr) {
  let q;
  if (dateStr) {
    q = query(collection(db, "conversoes"), where("date", "==", dateStr));
  } else {
    q = query(collection(db, "conversoes"));
  }
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getMissionLogsByDate(dateStr) {
  let q;
  if (dateStr) {
    q = query(collection(db, "missionLogs"), where("date", "==", dateStr));
  } else {
    q = query(collection(db, "missionLogs"));
  }
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, _collection: "missionLogs", ...d.data() }));
}
