import fs from "fs";
import path from "path";

interface Movie {
  id: number;
  title: string;
  year: number;
  decade: string;
  director: string;
  genres: string[];
  actors: string[];
}

const API_KEY = process.env.TMDB_API_KEY;
const PAGES = 50;
const OUTPUT_FILE = path.join(process.cwd(), "/public/top-rated-movies.json");

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const genreMap: { [key: number]: string } = {
  28: "Action",
  12: "Adventure",
  16: "Animation",
  35: "Comedy",
  80: "Crime",
  99: "Documentary",
  18: "Drama",
  10751: "Family",
  14: "Fantasy",
  36: "History",
  27: "Horror",
  10402: "Music",
  9648: "Mystery",
  10749: "Romance",
  878: "Sci-Fi",
  10770: "TV Movie",
  53: "Thriller",
  10752: "War",
  37: "Western",
};

async function fetchTopRatedMovies() {
  const topMovies: Movie[] = [];
  console.log("Krecem za fecovanjem filmova");

  for (let page = 1; page <= PAGES; page++) {
    try {
      const url = `https://api.themoviedb.org/3/movie/top_rated?api_key=${API_KEY}&language=en-US&page=${page}`;
      const res = await fetch(url);
      const data = await res.json();

      if (!data.results) continue;

      for (const movie of data.results) {
        if (movie.vote_count < 5000) continue;

        const releaseYear = parseInt(movie.release_date.split("-")[0]);
        const decade = `${Math.floor(releaseYear / 10) * 10}s`;

        const creditsUrl = `https://api.themoviedb.org/3/movie/${movie.id}/credits?api_key=${API_KEY}`;
        const creditsRes = await fetch(creditsUrl);
        const credistData = await creditsRes.json();

        const director = credistData.crew.find(
          (member: any) => member.job === "Director"
        );
        const dircetorName = director.name;

        const actors: string[] = credistData.cast
          .slice(0, 4)
          .map((actor: any) => actor.name);

        const genres: string[] = movie.genre_ids.map(
          (genre: number) => genreMap[genre] || "Other"
        );

        topMovies.push({
          id: movie.id,
          title: movie.title,
          year: releaseYear,
          decade: decade,
          director: dircetorName,
          genres: genres,
          actors: actors,
        });
      }

      console.log(`Obradjen je stranica ${page}`);
      await delay(250);
    } catch (err) {
      console.error("Greska tokom fecovanja filmova", err);
    }
  }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(topMovies, null, 2), "utf-8");

  console.log("Fajl je kreiran");
}

fetchTopRatedMovies();
