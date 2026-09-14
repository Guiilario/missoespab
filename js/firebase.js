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
export async function createUserAsAdmin({ name, email, password }) {
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
    // Mapear erros da REST API para o formato esperado pelo frontend
    if (code.includes("EMAIL_EXISTS")) err.code = "auth/email-already-in-use";
    else if (code.includes("INVALID_EMAIL")) err.code = "auth/invalid-email";
    else if (code.includes("WEAK_PASSWORD")) err.code = "auth/weak-password";
    else err.code = code;
    throw err;
  }

  const uid = signUpData.localId;
  const idToken = signUpData.idToken;

  // 2. Atualizar o nome do perfil, se fornecido
  if (name && idToken) {
    const updateUrl = `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${firebaseConfig.apiKey}`;
    await fetch(updateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken, displayName: name, returnSecureToken: true }),
    });
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
