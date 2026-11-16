import indexData from "@/data/movies-index.json";
import { dailyGridNumber, todayUTC } from "@/utils/dailyDate";

const index = indexData as Record<string, number[]>;

function haveSameMovie(key1: string, key2: string): boolean {
  const ids1 = index[key1];
  const ids2 = index[key2];

  return ids1.some((id) => ids2.includes(id));
}

// Da li se grid moze rijesiti sa 9 RAZLICITIH filmova (svaki film samo jednom).
// Nije dovoljno da svako polje ima bar jedan film: ako dva polja imaju samo
// isti jedan film, grid se ne moze rijesiti. Ovo je problem "uparivanja"
// (bipartite matching): polja se uparuju sa filmovima tako da svako polje
// dobije svoj film. Za 9 polja je to trenutno (Kuhn-ov algoritam).
function hasDistinctSolution(rows: string[], cols: string[]): boolean {
  // Kandidati za svako polje: filmovi koji su i u redu i u koloni
  const candidates: number[][] = [];
  for (const r of rows) {
    const rowMovies = new Set(index[r]);
    for (const c of cols) {
      candidates.push(index[c].filter((id) => rowMovies.has(id)));
    }
  }

  // film -> polje kome je trenutno dodijeljen
  const movieToCell = new Map<number, number>();

  // Pokusaj da polju nadjes film; ako je film zauzet, pokusaj da polje koje
  // ga drzi premjestis na neki drugi svoj film.
  const tryAssign = (cell: number, visited: Set<number>): boolean => {
    for (const movie of candidates[cell]) {
      if (visited.has(movie)) continue;
      visited.add(movie);
      const owner = movieToCell.get(movie);
      if (owner === undefined || tryAssign(owner, visited)) {
        movieToCell.set(movie, cell);
        return true;
      }
    }
    return false;
  };

  return candidates.every((_, cell) => tryAssign(cell, new Set()));
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
  // Singleplayer: svaki film smije samo jednom, pa grid mora biti rjesiv sa
  // 9 razlicitih filmova
  const grid = generateRandomGrid(seededRandom(`daily-${date}`), {
    requireDistinctMovies: true,
  });
  return { ...grid, date, number: dailyGridNumber(date) };
}

// random: izvor slucajnih brojeva. Multiplayer koristi Math.random (svaka
// partija drugaciji grid), a dnevni grid seededRandom (isti za sve).
// requireDistinctMovies: grid mora biti rjesiv sa 9 razlicitih filmova
// (singleplayer). Multiplayer ga ne trazi, jer tamo isti film smije vise puta.
export function generateRandomGrid(
  random: () => number = Math.random,
  { requireDistinctMovies = false } = {}
) {
  const allKeys = Object.keys(index);

  const allActors = allKeys.filter((k) => k.startsWith("actor"));
  const allDirectors = allKeys.filter((k) => k.startsWith("director"));
  const allGenres = allKeys.filter((k) => k.startsWith("genre"));
  const allDecades = allKeys.filter((k) => k.startsWith("decade"));

  const maxAttempts = 200;

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

    if (requireDistinctMovies && gridIsValid) {
      gridIsValid = hasDistinctSolution(rows, cols);
    }

    if (gridIsValid) return { rows, cols };
  }

  // Rezervni grid ako nijedan pokusaj ne uspije (provjereno da je rjesiv sa
  // 9 razlicitih filmova).
  return {
    rows: ["decade:1990s", "genre:Crime", "genre:War"],
    cols: ["actor:Tom Hanks", "director:Steven Spielberg", "director:Quentin Tarantino"],
  };
}
