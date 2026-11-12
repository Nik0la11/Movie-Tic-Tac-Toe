import type { NextRequest } from "next/server";
import { errorResponse, tmdbFetch } from "@/utils/tmdbServer";

// GET /api/movies/27205 - detalji filma za provjeru poteza u singleplayeru.
// Vraca isti oblik kao TMDB (genres, credits.cast, credits.crew), ali samo
// polja koja igra koristi.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Samo broj - ne moze se podmetnuti neka druga TMDB putanja
  if (!/^\d{1,10}$/.test(id)) {
    return errorResponse("Invalid movie id", 400);
  }

  try {
    const data = await tmdbFetch(`/movie/${id}`, {
      append_to_response: "credits",
    });

    return Response.json({
      id: data.id,
      title: data.title,
      poster_path: data.poster_path,
      release_date: data.release_date,
      genres: data.genres ?? [],
      credits: {
        cast: (data.credits?.cast ?? []).map((p: { name: string }) => ({
          name: p.name,
        })),
        crew: (data.credits?.crew ?? [])
          .filter((p: { job: string }) => p.job === "Director")
          .map((p: { name: string; job: string }) => ({
            name: p.name,
            job: p.job,
          })),
      },
    });
  } catch (err) {
    console.error("TMDB movie error", err);
    return errorResponse("Movie not found", 502);
  }
}
