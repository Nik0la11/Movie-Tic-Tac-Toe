async function fetchFromTMDB(endpoint: string, params = "") {
  const res = await fetch(
    `/api/movies?endpoint=${encodeURIComponent(
      endpoint
    )}&params=${encodeURIComponent(params)}`
  );
  return res.json();
}

export async function generateRandomGrid() {
  try {
    const randomPage = Math.floor(Math.random() * 50) + 1;

    const discoverData = await fetchFromTMDB(
      `/discover/movie`,
      `&sort_by=popularity.desc&vote_count.gte=5000&page=${randomPage}&include_adult=false`
    );

    const shuffledMovies = discoverData.results
      .sort(() => 0.5 - Math.random())
      .slice(0, 20);

    const moviesDatabase = [];

    for (const movie of shuffledMovies) {
      const movieDetails = await fetchFromTMDB(`/movie/${movie.id}`);
      console.log(movieDetails);
      const credistData = await fetchFromTMDB(`/movie/${movie.id}/credits`);
      //console.log(credistData);
      const releaseYear = movieDetails.release_date
        ? parseInt(movieDetails.release_date.split("-")[0])
        : null;

      const releaseDecade = releaseYear
        ? `${Math.floor(releaseYear / 10) * 10}s`
        : null;

      console.log(releaseDecade);

      const genres = movieDetails.genres.map((g: any) => g.name);
      const director = credistData.crew.find(
        (member: any) => member.job === "Director"
      )?.name;
      console.log(director);

      const topActors = credistData.cast
        .slice(0, 5)
        .map((actor: any) => actor.name);
      console.log(topActors);

      if (releaseYear && genres.length > 0) {
        moviesDatabase.push({
          title: movieDetails.title,
          year: releaseYear.toString(),
          decade: releaseDecade,
          director: director,
          actors: topActors,
        });
      }
    }

    console.log(moviesDatabase);

    const moviesOnDiagonal = moviesDatabase.slice(0, 3);

    const rowInfo = [];
    const colInfo = [];
  } catch (err) {
    console.error("Greska pri generisanju grida: ", err);
    return null;
  }
}
