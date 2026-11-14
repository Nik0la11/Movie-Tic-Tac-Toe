// Provjera da li film odgovara polju grida. Isti kod koriste multiplayer server
// (server/server.js) i singleplayer (/api/check), pa isti film u istom polju
// uvijek daje isti rezultat. Radi samo na serveru (koristi TMDB kljuc).

const TMDB_BASE_URL = "https://api.themoviedb.org/3";

// Koliko najduze cekamo TMDB pri provjeri filma
const TMDB_TIMEOUT_MS = 8000;

// Nazivi zanrova u gridu -> TMDB genre ID
const GENRE_IDS: Record<string, number> = {
  Action: 28,
  Adventure: 12,
  Animation: 16,
  Comedy: 35,
  Crime: 80,
  Documentary: 99,
  Drama: 18,
  Family: 10751,
  Fantasy: 14,
  History: 36,
  Horror: 27,
  Music: 10402,
  Mystery: 9648,
  Romance: 10749,
  "Sci-Fi": 878,
  "TV Movie": 10770,
  Thriller: 53,
  War: 10752,
  Western: 37,
};

export interface CheckedMovie {
  id: number;
  title: string;
  poster_path: string | null;
  decade: string | null; // "1990s"
  genreIds: number[];
  directors: string[];
  actors: string[];
}

export const fetchMovie = async (movieId: number): Promise<CheckedMovie> => {
  const res = await fetch(
    `${TMDB_BASE_URL}/movie/${movieId}?api_key=${process.env.TMDB_KEY}&append_to_response=credits`,
    { signal: AbortSignal.timeout(TMDB_TIMEOUT_MS) }
  );

  if (!res.ok) {
    throw new Error(`TMDB vratio status ${res.status} za film ${movieId}`);
  }

  const data = await res.json();

  const releaseYear = parseInt((data.release_date || "").split("-")[0]);

  return {
    id: data.id,
    title: data.title,
    poster_path: data.poster_path,
    decade: Number.isNaN(releaseYear)
      ? null
      : `${Math.floor(releaseYear / 10) * 10}s`,
    genreIds: (data.genres || []).map((genre: { id: number }) => genre.id),
    // Svi reziseri (film moze imati vise njih)
    directors: (data.credits?.crew || [])
      .filter((member: { job: string }) => member.job === "Director")
      .map((member: { name: string }) => member.name),
    // Cijeli spisak glumaca, ne samo prvih par: priznaju se i manje uloge i
    // uloge van spice (npr. Kevin Spacey u Se7en je 57. na TMDB spisku).
    // Grid se i dalje pravi samo od prva 4 glumca (movies-index.json), da bi
    // svako polje sigurno imalo poznat odgovor.
    actors: (data.credits?.cast || []).map(
      (actor: { name: string }) => actor.name
    ),
  };
};

// criterion je u formatu "tip:vrijednost", npr. "genre:Sci-Fi", "actor:Brad Pitt"
export const matchesCriterion = (movie: CheckedMovie, criterion: string) => {
  const separatorIndex = criterion.indexOf(":");
  const type = criterion.slice(0, separatorIndex);
  const value = criterion.slice(separatorIndex + 1);

  switch (type) {
    case "genre":
      return movie.genreIds.includes(GENRE_IDS[value]);
    case "decade":
      return movie.decade === value;
    case "actor":
      return movie.actors.includes(value);
    case "director":
      return movie.directors.includes(value);
    default:
      return false;
  }
};

// Polje 0-8: red = cellIndex / 3, kolona = cellIndex % 3
export const movieFitsCell = (
  movie: CheckedMovie,
  grid: { rows: string[]; cols: string[] },
  cellIndex: number
) =>
  matchesCriterion(movie, grid.rows[Math.floor(cellIndex / 3)]) &&
  matchesCriterion(movie, grid.cols[cellIndex % 3]);
