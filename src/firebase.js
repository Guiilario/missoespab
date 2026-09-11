import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
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

// Analytics only works in a browser context that supports it (not SSR, not every test env)
export let analytics = null;
isSupported().then((ok) => {
  if (ok) analytics = getAnalytics(app);
});
