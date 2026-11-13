import { connection } from "next/server";
import { generateDailyGrid } from "@/utils/tmdb";
import SinglePlayerGame from "./SinglePlayerGame";

// Server komponenta: dnevni grid se pravi ovdje i salje zajedno sa stranicom,
// pa browser odmah prikaze grid (bez praznog ekrana i bez cekanja /api/grid).
// U browser idu samo nazivi redova i kolona - spisak odgovora ostaje na serveru.
export default async function SinglePlayerPage() {
  // Bez ovoga bi Next napravio grid jednom pri build-u i svi dani bi imali isti
  await connection();

  return <SinglePlayerGame initialGrid={generateDailyGrid()} />;
}
