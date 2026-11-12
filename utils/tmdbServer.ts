// Pozivi ka TMDB-u sa nasim kljucem - koristi se SAMO u API rutama (na serveru).
// Ranije je /api/movies prosledjivao bilo koji endpoint, pa je svako mogao da
// koristi nas kljuc za sta hoce. Sada postoje samo dva fiksna upita.

const BASE_URL = "https://api.themoviedb.org/3";
const TIMEOUT_MS = 8000;

export const tmdbFetch = async (
  path: string,
  params: Record<string, string> = {}
) => {
  const url = new URL(BASE_URL + path);
  url.searchParams.set("api_key", process.env.TMDB_KEY ?? "");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
};

export const errorResponse = (message: string, status: number) =>
  Response.json({ error: message }, { status });
