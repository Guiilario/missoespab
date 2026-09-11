// XP curve: XP required to go from level N to N+1 grows linearly.
// Level 1 starts at 0 XP. Adjust BASE / STEP to tune the pacing.
const BASE = 600; // XP needed for the first level-up
const STEP = 400; // extra XP required per subsequent level

/** Total cumulative XP needed to REACH a given level (level 1 = 0). */
export function xpForLevel(level) {
  if (level <= 1) return 0;
  let total = 0;
  for (let l = 1; l < level; l++) {
    total += BASE + STEP * (l - 1);
  }
  return total;
}

/** Given total accumulated XP, derive level + progress toward next level. */
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
