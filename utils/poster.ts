// Posteri na polju grida (singleplayer i multiplayer).
// w342 umjesto w500: duplo manji fajl, a polje je siroko ~100px, pa je i na
// telefonima sa gustim ekranom dovoljno ostro.
const GRID_POSTER_SIZE = "w342";

export const gridPosterUrl = (posterPath: string | null | undefined) =>
  posterPath ? `https://image.tmdb.org/t/p/${GRID_POSTER_SIZE}${posterPath}` : "";

// Browser pocne da skida poster cim igrac izabere film iz pretrage, dok
// klikce "Choose" i dok server provjerava film. Kad stigne odgovor da je film
// tacan, poster je obicno vec skinut i pojavi se odmah.
export const preloadGridPoster = (posterPath: string | null | undefined) => {
  if (!posterPath || typeof window === "undefined") return;
  const img = new Image();
  img.src = gridPosterUrl(posterPath);
};
