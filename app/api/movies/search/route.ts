import type { NextRequest } from "next/server";
import { errorResponse, tmdbFetch } from "@/utils/tmdbServer";

const MAX_QUERY_LENGTH = 100;

// GET /api/movies/search?query=incep
// Vraca samo ono sto treba za listu u pretrazi.
export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("query")?.trim() ?? "";

  if (query.length < 2 || query.length > MAX_QUERY_LENGTH) {
    return errorResponse("Invalid query", 400);
  }

  try {
    const data = await tmdbFetch("/search/movie", {
      query,
      include_adult: "false",
      language: "en-US",
    });

    const results = (data.results ?? []).map(
      (movie: { id: number; title: string; poster_path: string | null }) => ({
        id: movie.id,
        title: movie.title,
        poster_path: movie.poster_path,
      })
    );

    return Response.json({ results });
  } catch (err) {
    console.error("TMDB search error", err);
    return errorResponse("Movie search failed", 502);
  }
}
