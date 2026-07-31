import fs from "fs";
import path from "path";
import moviesData from "@/public/top-rated-movies.json";

interface Movie {
  id: number;
  title: string;
  year: number;
  decade: string;
  director: string;
  genres: string[];
  actors: string[];
}

const OUTPUT_FILE = path.join(process.cwd(), "/public/movies-index.json");

const movies = moviesData as Movie[];

const MovieIndex: Record<string, number[]> = {};

movies.forEach((movie) => {
  const movieId = movie.id;

  const addToIndex = (key: string) => {
    if (!MovieIndex[key]) MovieIndex[key] = [];
    MovieIndex[key].push(movieId);
  };

  movie.actors.forEach((actor) => {
    addToIndex(actor);
  });

  movie.genres.forEach((genre) => {
    addToIndex(genre);
  });

  addToIndex(movie.decade);

  addToIndex(movie.director);

  console.log(`Obradjen je film ${movie.title}`);
});

fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(MovieIndex, null, 2), "utf-8");

console.log("Fajl je kreiran");
