import { NextResponse } from "next/server";
import { generateRandomGrid } from "@/utils/tmdb";

// Grid za singleplayer se pravi na serveru, da spisak tacnih odgovora
// (data/movies-index.json) nikad ne dodje u browser.
// GET rute se u ovoj verziji Next-a ne kesiraju - svaki poziv daje novi grid.
export async function GET() {
  return NextResponse.json(generateRandomGrid(), {
    headers: { "Cache-Control": "no-store" },
  });
}
