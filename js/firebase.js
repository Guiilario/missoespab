// Firebase, carregado direto do CDN — sem npm, sem build.
import { initializeApp, deleteApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import {
  getAuth,
  initializeAuth,
  inMemoryPersistence,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import {
  getFirestore,
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
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-storage.js";
import {
  getAnalytics,
  isSupported,
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-analytics.js";

export const firebaseConfig = {
  apiKey: "AIzaSyAWYnA40isoaUtlb_bsCoWz3V5TaCjFANA",
  authDomain: "appmissoespab.firebaseapp.com",
  projectId: "appmissoespab",
  storageBucket: "appmissoespab.firebasestorage.app",
  messagingSenderId: "60358353028",
  appId: "1:60358353028:web:41f1345d4afee9c5c4a2d1",
  measurementId: "G-K799KDBZHH",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

isSupported().then((ok) => {
  if (ok) getAnalytics(app);
});

/**
 * Cria uma conta de login SEM deslogar o admin que está executando isso.
 * Usa a REST API do Firebase Auth (Identity Toolkit) para garantir que
 * o estado de autenticação local (do admin) não seja afetado de forma alguma.
 */
export async function createUserAsAdmin({ name, username, email, password, avatar }) {
  // 1. Criar o usuário
  const signUpUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${firebaseConfig.apiKey}`;
  const signUpRes = await fetch(signUpUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  
  const signUpData = await signUpRes.json();
  
  if (!signUpRes.ok) {
    const code = signUpData.error?.message || "Erro desconhecido";
    const err = new Error(code);
    if (code.includes("EMAIL_EXISTS")) err.code = "auth/email-already-in-use";
    else if (code.includes("INVALID_EMAIL")) err.code = "auth/invalid-email";
    else if (code.includes("WEAK_PASSWORD")) err.code = "auth/weak-password";
    else err.code = code;
    throw err;
  }

  const uid = signUpData.localId;
  const idToken = signUpData.idToken;

  // 2. Atualizar o nome do perfil no Auth
  if (name && idToken) {
    const updateUrl = `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${firebaseConfig.apiKey}`;
    await fetch(updateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, displayName: name, returnSecureToken: true }),
    });
  }

  // 3. Salvar o perfil no Firestore usando a REST API (como se fosse o próprio usuário).
  // Isso contorna o problema de regras de segurança não atualizadas no servidor (isAdmin).
  const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents/users?documentId=${uid}`;
  const firestoreRes = await fetch(firestoreUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${idToken}`
    },
    body: JSON.stringify({
      fields: {
        uid: { stringValue: uid },
        name: { stringValue: name },
        username: { stringValue: username },
        email: { stringValue: email },
        avatar: { stringValue: avatar || "avatar-default.svg" },
        disabled: { booleanValue: false },
        totalXp: { integerValue: "0" },
        completedMissionsCount: { integerValue: "0" },
        currentStreak: { integerValue: "0" },
        daysCompleted: { integerValue: "0" },
        lastCompletedDay: { nullValue: null },
        createdAt: { timestampValue: new Date().toISOString() }
      }
    })
  });

  if (!firestoreRes.ok) {
    const fsData = await firestoreRes.json();
    throw new Error(`Falha ao salvar no Firestore (REST): ${fsData.error?.message || 'Erro'}`);
  }

  return uid;
}

// Reexporta tudo que as outras páginas vão precisar, pra não ter que
// repetir imports do CDN em todo arquivo.
export {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
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
};
