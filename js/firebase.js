// Firebase, carregado direto do CDN — sem npm, sem build.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  updatePassword,
  sendPasswordResetEmail,
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";
import {
  getFirestore,
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
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-storage.js";
import {
  getAnalytics,
  isSupported,
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-analytics.js";

const firebaseConfig = {
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

// Reexporta tudo que as outras páginas vão precisar, pra não ter que
// repetir imports do CDN em todo arquivo.
export {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  updateProfile,
  updatePassword,
  sendPasswordResetEmail,
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
};
