import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const endpoint = searchParams.get("endpoint");
  const params = searchParams.get("params") || "";

  if (!endpoint) {
    return NextResponse.json({ error: "Nedostaje endpoint" }, { status: 400 });
  }

  const API_KEY = process.env.TMDB_KEY;
  const BASE_URL = "https://api.themoviedb.org/3";

  const res = await fetch(`${BASE_URL}${endpoint}?api_key=${API_KEY}${params}`);
  const data = await res.json();

  return NextResponse.json(data);
}
