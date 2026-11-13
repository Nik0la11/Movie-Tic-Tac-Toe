import { NextResponse } from "next/server";
import { generateDailyGrid } from "@/utils/tmdb";

// Dnevni grid za singleplayer: isti za sve igrace tog dana (po UTC-u).
// Pravi se na serveru, da spisak tacnih odgovora (data/movies-index.json)
// nikad ne dodje u browser.
// GET rute se u ovoj verziji Next-a ne kesiraju, pa se novi dan uvijek vidi.
export async function GET() {
  return NextResponse.json(generateDailyGrid(), {
    headers: { "Cache-Control": "no-store" },
  });
}
