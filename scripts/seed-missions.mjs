// Script opcional para popular missões de exemplo — NÃO faz parte do app em si
// (o app roda 100% sem Node/build, só HTML+JS). Este script usa Node só porque
// é mais rápido que digitar documentos manualmente no Console do Firebase.
//
// Uso:
//   npm install firebase   (só para este script, uma vez)
//   node scripts/seed-missions.mjs SEU_UID_AQUI
//
// Alternativa sem Node nenhum: crie os documentos direto pelo Console do
// Firebase (Firestore Database → Iniciar coleção), seguindo os campos abaixo.

import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyAWYnA40isoaUtlb_bsCoWz3V5TaCjFANA",
  authDomain: "appmissoespab.firebaseapp.com",
  projectId: "appmissoespab",
  storageBucket: "appmissoespab.firebasestorage.app",
  messagingSenderId: "60358353028",
  appId: "1:60358353028:web:41f1345d4afee9c5c4a2d1",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const uid = process.argv[2];
if (!uid) {
  console.error("Uso: node scripts/seed-missions.mjs SEU_UID_AQUI");
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);

const missions = [
  {
    id: "m1",
    title: "Complete seu perfil",
    description: "Adicione uma foto e finalize suas informações de perfil.",
    xpReward: 150,
    difficulty: "easy",
    imageUrl: "",
  },
  {
    id: "m2",
    title: "Convide um amigo",
    description: "Compartilhe o app com alguém da sua comunidade.",
    xpReward: 250,
    difficulty: "medium",
    imageUrl: "",
  },
  {
    id: "m3",
    title: "Participe de uma atividade",
    description: "Registre sua participação em uma atividade da comunidade.",
    xpReward: 300,
    difficulty: "hard",
    imageUrl: "",
  },
];

async function run() {
  for (const m of missions) {
    await setDoc(doc(db, "missions", m.id), m);
    console.log(`Missão criada: ${m.id}`);
  }

  await setDoc(doc(db, "dailyAssignments", `${uid}_${today}`), {
    uid,
    date: today,
    missionIds: missions.map((m) => m.id),
  });
  console.log(`Atribuição de hoje criada para ${uid}`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
