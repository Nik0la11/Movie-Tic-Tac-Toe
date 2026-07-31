import indexData from "@/public/movies-index.json";

const index = indexData as Record<string, number[]>;

function haveSameMovie(key1: string, key2: string): boolean {
  const ids1 = index[key1];
  const ids2 = index[key2];

  return ids1.some((id) => ids2.includes(id));
}

export function generateRandomGrid() {
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
        Math.random() > 0.5
          ? allGenres[Math.floor(Math.random() * allGenres.length)]
          : allDecades[Math.floor(Math.random() * allDecades.length)];

      if (!rows.includes(randomKey)) rows.push(randomKey);
    }
    /*
    const moviesInRows = new Set([
      ...(index[rows[0]] || []),
      ...(index[rows[1]] || []),
      ...(index[rows[2]] || []),
    ]);
*/
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
          Math.floor(Math.random() * validColsForThisRows.length)
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
