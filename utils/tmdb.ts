import indexData from "@/data/movies-index.json";
import { dailyGridNumber, todayUTC } from "@/utils/dailyDate";

const index = indexData as Record<string, number[]>;

function haveSameMovie(key1: string, key2: string): boolean {
  const ids1 = index[key1];
  const ids2 = index[key2];

  return ids1.some((id) => ids2.includes(id));
}

// Generator slucajnih brojeva sa seed-om (mulberry32): isti seed uvijek daje
// isti niz brojeva, pa svi igraci dobiju isti grid za isti dan.
function seededRandom(seed: string) {
  // seed (npr. "2026-11-13") -> 32-bitni broj
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;

  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Isti grid za sve igrace tog dana (singleplayer). Mijenja se u ponoc po UTC-u.
export function generateDailyGrid(date = todayUTC()) {
  const grid = generateRandomGrid(seededRandom(`daily-${date}`));
  return { ...grid, date, number: dailyGridNumber(date) };
}

// random: izvor slucajnih brojeva. Multiplayer koristi Math.random (svaka
// partija drugaciji grid), a dnevni grid seededRandom (isti za sve).
export function generateRandomGrid(random: () => number = Math.random) {
  const allKeys = Object.keys(index);

  const allActors = allKeys.filter((k) => k.startsWith("actor"));
  const allDirectors = allKeys.filter((k) => k.startsWith("director"));
  const allGenres = allKeys.filter((k) => k.startsWith("genre"));
  const allDecades = allKeys.filter((k) => k.startsWith("decade"));

  let maxAttempts = 20;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rows: string[] = [];

    while (rows.length < 3) {
      const randomKey =
        random() > 0.5
          ? allGenres[Math.floor(random() * allGenres.length)]
          : allDecades[Math.floor(random() * allDecades.length)];

      if (!rows.includes(randomKey)) rows.push(randomKey);
    }

    const cols: string[] = [];

    const validColsForThisRows = allKeys.filter((key) => {
      if (!key.startsWith("actor") && !key.startsWith("director")) return false;

      const theirMovies = index[key];

      const hasRow0 = theirMovies.some((movie) =>
        index[rows[0]].includes(movie)
      );

      const hasRow1 = theirMovies.some((movie) =>
        index[rows[1]].includes(movie)
      );

      const hasRow2 = theirMovies.some((movie) =>
        index[rows[2]].includes(movie)
      );

      return hasRow0 && hasRow1 && hasRow2;
    });

    if (validColsForThisRows.length < 3) continue;

    while (cols.length < 3) {
      const randomKey =
        validColsForThisRows[
          Math.floor(random() * validColsForThisRows.length)
        ];

      if (!cols.includes(randomKey)) cols.push(randomKey);
    }

    let gridIsValid = true;

    for (const r of rows) {
      for (const c of cols) {
        if (!haveSameMovie(r, c)) {
          gridIsValid = false;
          break;
        }
      }
      if (!gridIsValid) break;
    }

    if (gridIsValid) return { rows, cols };
  }

  return {
    rows: ["genre:Action", "genre:Drama", "genre:Thriller"],
    cols: ["actor:Brad Pitt", "actor:Tom Cruise", "actor:Leonardo DiCaprio"],
  };
}
