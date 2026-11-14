import { generateDailyGrid } from "@/utils/tmdb";
import { todayUTC } from "@/utils/dailyDate";
import { fetchMovie, movieFitsCell } from "@/utils/movieCheck";

const DAY_MS = 24 * 60 * 60 * 1000;

const error = (message: string, status: number) =>
  Response.json({ error: message }, { status });

// POST /api/check  { date: "2026-11-14", cellIndex: 4, movieId: 27205 }
// Provjera poteza u singleplayeru, istim kodom kao u multiplayeru.
// Grid se ne salje iz browsera: server ga ponovo napravi iz datuma, pa igrac
// ne moze da podmetne svoj grid.
export async function POST(request: Request) {
  let body: { date?: unknown; cellIndex?: unknown; movieId?: unknown };
  try {
    body = await request.json();
  } catch {
    return error("Invalid request", 400);
  }

  const { date, cellIndex, movieId } = body;

  // Danasnji grid, ili jucerasnji ako je igrac poceo prije ponoci (UTC)
  const allowedDates = [todayUTC(), todayUTC(Date.now() - DAY_MS)];
  if (typeof date !== "string" || !allowedDates.includes(date)) {
    return error("This grid is no longer available", 400);
  }
  if (
    typeof cellIndex !== "number" ||
    !Number.isInteger(cellIndex) ||
    cellIndex < 0 ||
    cellIndex > 8
  ) {
    return error("Invalid cell", 400);
  }
  if (typeof movieId !== "number" || !Number.isInteger(movieId) || movieId <= 0) {
    return error("Invalid movie", 400);
  }

  let movie;
  try {
    movie = await fetchMovie(movieId);
  } catch (err) {
    console.error("Greska pri provjeri filma", err);
    return error("Could not verify movie, try again", 502);
  }

  const grid = generateDailyGrid(date);

  return Response.json({
    correct: movieFitsCell(movie, grid, cellIndex),
    movie: { id: movie.id, title: movie.title, poster_path: movie.poster_path },
  });
}
