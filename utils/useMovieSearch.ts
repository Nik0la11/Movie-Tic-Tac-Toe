"use client";

import { useEffect, useState } from "react";

export interface SearchMovie {
  id: number;
  title: string;
  poster_path: string | null;
}

// Koliko se ceka poslije zadnjeg otkucanog slova prije nego sto se pita server.
const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;

// Pretraga filmova za prozor za pogadjanje (singleplayer i multiplayer).
// - Ne zove API na svako slovo, nego tek kad igrac zastane 300ms.
// - Kad stigne novo slovo, prethodni zahtjev se prekida (AbortController),
//   pa stariji odgovor nikad ne moze da pregazi noviji.
// - Rezultati se pamte zajedno sa upitom za koji su stigli, pa se zna da li
//   odgovaraju onome sto trenutno pise u polju.
// - Dok se ceka novi odgovor, ostaju prikazani prethodni rezultati (bez
//   treptanja), a isSearching je true.
export function useMovieSearch(searchValue: string) {
  const [found, setFound] = useState<{ query: string; results: SearchMovie[] }>({
    query: "",
    results: [],
  });

  const query = searchValue.trim();

  useEffect(() => {
    if (query.length < MIN_QUERY_LENGTH) return;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/movies/search?query=${encodeURIComponent(query)}`,
          { signal: controller.signal }
        );
        const data = await res.json();
        setFound({ query, results: data.results ?? [] });
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          console.error("Greska u pretrazi filmova", err);
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const active = query.length >= MIN_QUERY_LENGTH;
  return {
    movies: active ? found.results : [],
    isSearching: active && found.query !== query,
  };
}
