// Curva de XP: cresce linearmente a cada nível. Nível 1 começa em 0 XP.
const BASE = 600; // XP para o primeiro level-up
const STEP = 400; // XP extra exigido por nível seguinte

/** XP total acumulado necessário para ALCANÇAR um nível (nível 1 = 0). */
export function xpForLevel(level) {
  if (level <= 1) return 0;
  let total = 0;
  for (let l = 1; l < level; l++) {
    total += BASE + STEP * (l - 1);
  }
  return total;
}

/** A partir do XP total, calcula nível + progresso até o próximo. */
export function getLevelProgress(totalXp) {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp) {
    level++;
  }
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);
  const xpIntoLevel = totalXp - floor;
  const xpForNext = ceiling - floor;
  const percent = Math.min(100, Math.round((xpIntoLevel / xpForNext) * 100));

  return {
    level,
    xpIntoLevel,
    xpForNext,
    xpRemaining: Math.max(0, xpForNext - xpIntoLevel),
    percent,
    totalXp,
  };
}
