// Script opcional para popular missões de exemplo — NÃO faz parte do app em si
// (o app roda 100% sem Node/build, só HTML+JS). Hoje em dia o jeito normal de
// criar missões é pelo painel /admin.html — este script só é útil pra testar
// rapidinho sem entrar no painel.
//
// Uso:
//   npm install firebase   (só para este script, uma vez)
//   node scripts/seed-missions.mjs
//
// Alternativa sem Node nenhum: use o painel /admin.html (recomendado), ou
// crie os documentos direto pelo Console do Firebase.

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

  // dailyAssignments agora é GLOBAL por data (não por usuário) — vale pra
  // todo mundo que logar hoje.
  await setDoc(doc(db, "dailyAssignments", today), {
    date: today,
    missionIds: missions.map((m) => m.id),
  });
  console.log(`Missões de hoje (${today}) atribuídas pra todo mundo.`);
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
