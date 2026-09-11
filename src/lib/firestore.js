import {
  doc,
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
} from "firebase/firestore";
import { db } from "../firebase";

/** Returns the current date as YYYY-MM-DD, used as the daily assignment key. */
export function todayKey() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

// ---------- USERS ----------

export async function createUserProfile(uid, { name, username, email }) {
  const ref = doc(db, "users", uid);
  await setDoc(ref, {
    uid,
    name,
    username,
    email,
    avatarUrl: "",
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

// ---------- DAILY MISSIONS ----------

/**
 * Subscribes to today's 3 assigned missions for this user.
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
 * Marks a mission as completed for the user today, awards XP exactly once.
 * Uses a Firestore transaction keyed on missionCompletions/{uid}_{missionId}_{date}
 * so duplicate submissions (refresh, double-tap, retried request) are ignored.
 */
export async function completeMission(uid, missionId, xpReward) {
  const date = todayKey();
  const completionId = `${uid}_${missionId}_${date}`;
  const completionRef = doc(db, "missionCompletions", completionId);
  const userRef = doc(db, "users", uid);

  await runTransaction(db, async (tx) => {
    const existing = await tx.get(completionRef);
    if (existing.exists()) {
      // Already rewarded — no-op, prevents duplicate XP.
      return;
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
 * Marks the current day as complete for the user (all 3 missions done),
 * updates streak. Idempotent: only advances streak once per day.
 */
export async function markDayCompleted(uid) {
  const date = todayKey();
  const userRef = doc(db, "users", uid);

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(userRef);
    if (!snap.exists()) return;
    const data = snap.data();
    if (data.lastCompletedDay === date) {
      // already marked today
      return;
    }

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

// ---------- RANKING ----------

export function subscribeToRanking(callback, topN = 50) {
  const q = query(collection(db, "users"), orderBy("totalXp", "desc"), limit(topN));
  return onSnapshot(q, (snap) => {
    const rows = snap.docs.map((d, i) => ({ id: d.id, rank: i + 1, ...d.data() }));
    callback(rows);
  });
}
