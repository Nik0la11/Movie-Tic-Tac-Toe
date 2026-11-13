"use client";

import React, { useState } from "react";
import { useEffect } from "react";
import Footer from "../components/Footer";
import Header from "../components/Header";
import { msUntilNextGrid, todayUTC } from "@/utils/dailyDate";

interface Cell {
  id: number;
  status: "empty" | "correct" | "failed";
  movieTitle: string;
  claimedBy: "X" | "O" | null;
}

interface Movie {
  id: number;
  title: string;
  poster_path: string;
  year: number;
  decade: string;
  director: string;
  genres: string[];
  actors: string[];
}

// Dnevni grid: isti za sve igrace tog dana. Pravi ga server (page.tsx ili
// /api/grid), a browser dobija samo nazive redova i kolona.
export interface DailyGrid {
  rows: string[];
  cols: string[];
  date: string; // "2026-11-13" (UTC)
  number: number; // redni broj dnevnog grida, za "Share"
}

type Guesses = Record<number, { poster_path: string; title: string }>;

// Napredak za dan se cuva u browseru, da refresh ne obrise pogodjena polja
const progressKey = (date: string) => `movie-ttt-daily-${date}`;

const loadProgress = (grid: DailyGrid) => {
  try {
    const raw = localStorage.getItem(progressKey(grid.date));
    if (!raw) return null;
    const saved = JSON.parse(raw);
    // Ako se grid za taj dan promijenio (npr. novi movies-index.json), ne vracaj stari napredak
    if (
      JSON.stringify(saved.rows) !== JSON.stringify(grid.rows) ||
      JSON.stringify(saved.cols) !== JSON.stringify(grid.cols)
    ) {
      return null;
    }
    return saved as { guesses: Guesses; attempts: number };
  } catch {
    return null;
  }
};

const saveProgress = (grid: DailyGrid, guesses: Guesses, attempts: number) => {
  try {
    localStorage.setItem(
      progressKey(grid.date),
      JSON.stringify({ rows: grid.rows, cols: grid.cols, guesses, attempts })
    );
  } catch {
    // bez localStorage-a napredak se gubi na refresh
  }
};

// 5h 12m / 12m
const formatCountdown = (ms: number) => {
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

// initialGrid stize sa servera zajedno sa stranicom, pa se grid vidi odmah
// (bez praznog ekrana dok se ceka /api/grid)
const SinglePlayerGame = ({ initialGrid }: { initialGrid: DailyGrid }) => {
  const [gridData, setGridData] = useState<DailyGrid>(initialGrid);
  // Broj izabranih filmova (tacnih i netacnih) za danasnji grid
  const [attempts, setAttempts] = useState(0);
  const [shareCopied, setShareCopied] = useState(false);
  // Za koji datum je napredak iz localStorage vec ucitan. Dok nije, napredak
  // se ne cuva (da prazna tabla ne prepise sacuvana pogodjena polja).
  const [progressDate, setProgressDate] = useState<string | null>(null);
  // null dok se stranica ne pokrene u browseru: sat servera i browsera se
  // razlikuju, pa bi odbrojavanje u HTML-u sa servera bilo pogresno
  const [now, setNow] = useState<number | null>(null);

  const [cells, setCells] = useState<Cell[]>(
    Array.from({ length: 9 }, (_, index) => ({
      id: index,
      status: "empty",
      movieTitle: "",
      claimedBy: null,
    }))
  );

  const [isCellClicked, setIsCellClicked] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [searchMovies, setSearchMovies] = useState<Movie[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [clickedCell, setClickedCell] = useState<number | null>(null);
  const [cellRow, setCellRow] = useState("");
  const [cellCol, setCellCol] = useState("");
  const [gridGuesses, setGridGuesses] = useState<Guesses>({});

  const handleClick = (cellId: number, rowName: string, colName: string) => {
    console.log(`Kliknuto je polje sa ID: ${cellId}`);
    setIsCellClicked(true);
    setClickedCell(cellId);
    setCellRow(rowName);
    setCellCol(colName);
  };

  // Danasnji datum u browseru (prije pokretanja: datum grida sa servera)
  const currentDate = now == null ? initialGrid.date : todayUTC(now);

  useEffect(() => {
    let cancelled = false;

    const showGrid = (grid: DailyGrid) => {
      const saved = loadProgress(grid);
      setGridGuesses(saved?.guesses ?? {});
      setAttempts(saved?.attempts ?? 0);
      setIsCellClicked(false);
      setGridData(grid);
      setProgressDate(grid.date);
    };

    // Grid sa servera je za danasnji dan: samo vrati sacuvani napredak
    if (gridData.date === currentDate) {
      if (progressDate !== currentDate) showGrid(gridData);
      return;
    }

    // Poceo je novi dan dok je stranica otvorena: ucitaj novi grid
    // (pravi ga server, spisak odgovora ne smije biti u browseru)
    const loadGrid = async () => {
      try {
        const res = await fetch("/api/grid", { cache: "no-store" });
        const grid = (await res.json()) as DailyGrid;
        if (!cancelled) showGrid(grid);
      } catch (err) {
        console.error("Greska pri ucitavanju grida", err);
      }
    };

    loadGrid();
    return () => {
      cancelled = true;
    };
    // gridData i progressDate se namjerno ne prate: grid se mijenja samo s danom
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentDate]);

  // Sat za odbrojavanje do sledeceg grida (i prelazak na novi dan)
  useEffect(() => {
    setNow(Date.now());
    const interval = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(interval);
  }, []);

  // Cuvaj napredak cim se promijeni (tek kad je sacuvani napredak ucitan)
  useEffect(() => {
    if (progressDate === gridData.date) {
      saveProgress(gridData, gridGuesses, attempts);
    }
  }, [gridData, gridGuesses, attempts, progressDate]);

  const solvedCount = Object.keys(gridGuesses).length;
  const isComplete = solvedCount === 9;

  // Rezultat za dijeljenje, npr:
  // Movie Tic Tac Toe #3
  // 🟩🟩⬜
  // ...
  // 6/9 in 8 guesses
  const handleShare = async () => {
    const rows = [0, 1, 2]
      .map((r) =>
        [0, 1, 2].map((c) => (gridGuesses[r * 3 + c] ? "🟩" : "⬜")).join("")
      )
      .join("\n");
    const text = [
      `Movie Tic Tac Toe #${gridData.number}`,
      rows,
      `${solvedCount}/9 in ${attempts} ${attempts === 1 ? "guess" : "guesses"}`,
      `${window.location.origin}/singleplayer`,
    ].join("\n");

    try {
      await navigator.clipboard.writeText(text);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch (err) {
      console.error("Greska u kopiranju rezultata", err);
    }
  };

  useEffect(() => {
    const fetchMovies = async () => {
      if (searchValue.trim().length < 2) return;

      const res = await fetch(
        `/api/movies/search?query=${encodeURIComponent(searchValue.trim())}`
      );
      const data = await res.json();
      setSearchMovies(data.results ?? []);
    };

    fetchMovies();
  }, [searchValue]);

  const handleClose = () => {
    setIsCellClicked(false);
    setSearchValue("");
    setSelectedMovie(null);
  };

  const handleSelectMovieFromSearch = async (movieId: number) => {
    try {
      const res = await fetch(`/api/movies/${movieId}`);
      const data = await res.json();
      console.log(data);

      const directorObject = data.credits.crew.find(
        (member: any) => member.job === "Director"
      );

      const releaseYear = parseInt(data.release_date.split("-")[0]);
      const decade = `${Math.floor(releaseYear / 10) * 10}s`;
      const genres: string[] = data.genres.map((genre: any) => genre.name);
      // Cijeli spisak glumaca (i manje uloge), isto kao na serveru
      const actors: string[] = data.credits.cast.map(
        (actor: any) => actor.name
      );

      const completeMovie = {
        id: data.id,
        title: data.title,
        poster_path: data.poster_path,
        year: releaseYear,
        decade: decade,
        director: directorObject ? directorObject.name : "Unknown Director",
        genres: genres,
        actors: actors || [],
      };

      setSelectedMovie(completeMovie);
      setSearchValue("");
    } catch (err) {
      console.error("Error: ", err);
    }
  };

  const handleChooseMovie = (movie: Movie) => {
    // Svaki izabran film je pokusaj, tacan ili ne
    setAttempts((a) => a + 1);

    const rowType = cellRow.split(":")[0];
    const rowValue = cellRow.split(":")[1];
    const colType = cellCol.split(":")[0];
    const colValue = cellCol.split(":")[1];

    // Ovo promijeniti da poredi idejeve umjeseto imena zanrova

    switch (true) {
      case rowType === "genre" && colType === "actor": {
        let genreToComapre = rowValue;

        if (rowValue === "Sci-Fi") {
          genreToComapre = "Science Fiction";
        }

        if (
          movie.actors.some((actor) => actor === colValue) &&
          movie.genres.some((genre) => genre === genreToComapre)
        ) {
          setGridGuesses((prev) => ({
            ...prev,
            [clickedCell!]: {
              poster_path: movie.poster_path,
              title: movie.title,
            },
          }));
        }
        break;
      }

      case rowType === "genre" && colType === "director": {
        let genreToComapre = rowValue;

        if (rowValue === "Sci-Fi") {
          genreToComapre = "Science Fiction";
        }

        if (
          movie.director === colValue &&
          movie.genres.some((genre) => genre === genreToComapre)
        ) {
          setGridGuesses((prev) => ({
            ...prev,
            [clickedCell!]: {
              poster_path: movie.poster_path,
              title: movie.title,
            },
          }));
        }
        break;
      }

      case rowType === "decade" && colType === "actor": {
        if (
          movie.actors.some((actor) => actor === colValue) &&
          movie.decade === rowValue
        ) {
          setGridGuesses((prev) => ({
            ...prev,
            [clickedCell!]: {
              poster_path: movie.poster_path,
              title: movie.title,
            },
          }));
        }
        break;
      }

      case rowType === "decade" && colType === "director": {
        if (movie.director === colValue && movie.decade === rowValue) {
          setGridGuesses((prev) => ({
            ...prev,
            [clickedCell!]: {
              poster_path: movie.poster_path,
              title: movie.title,
            },
          }));
        }
        break;
      }

      default:
        console.log("Greska");
    }

    setIsCellClicked(false);
    setSearchValue("");
    setSelectedMovie(null);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950">
      {/* Header */}

      <Header />

      {/* Dnevni grid: broj, napredak, share i vrijeme do sledeceg */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 max-w-md w-full mx-auto md:ml-122 px-1 text-sm">
        <div className="flex flex-col">
          <span className="font-semibold text-white">
            Daily grid #{gridData.number}
          </span>
          <span className="text-slate-400">
            {isComplete ? "Solved! " : `${solvedCount}/9 · `}
            {attempts} {attempts === 1 ? "guess" : "guesses"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-400">
            {now != null &&
              `Next grid in ${formatCountdown(msUntilNextGrid(now))}`}
          </span>
          <button
            onClick={handleShare}
            disabled={attempts === 0}
            className="rounded-md bg-emerald-600 px-3 py-1 font-semibold text-white cursor-pointer hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {shareCopied ? "Copied!" : "Share"}
          </button>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-4 gap-1 max-w-md w-full mx-auto md:ml-122">
        <div className="bg-transparent p-4"></div>

        {gridData?.cols.map((col: string, index: number) => (
          <div
            key={index}
            className="bg-transparent flex items-center justify-center p-4 break-words leading-tight text-l text-center "
          >
            {col.split(":")[1]}
          </div>
        ))}

        {gridData?.rows.map((rowName: string, rowIndex: number) => (
          <React.Fragment key={rowIndex}>
            <div className="bg-transparent flex items-center justify-center p-4 break-words leading-tight aspect-[2/3] text-l text-center ">
              {rowName.split(":")[1]}
            </div>

            {[0, 1, 2].map((colIndex) => {
              const cellId = rowIndex * 3 + colIndex;

              const colName = gridData?.cols[colIndex] || "";

              const guessedMovie = gridGuesses[cellId];

              return (
                <button
                  onClick={() => handleClick(cellId, rowName, colName)}
                  key={cellId}
                  disabled={!!guessedMovie}
                  className="relative cursor-pointer bg-slate-800 flex items-center justify-center p-4 break-words leading-tight aspect-[2/3] text-l"
                >
                  {guessedMovie ? (
                    <img
                      className="absolute inset-0 w-full h-full object-cover"
                      alt={guessedMovie?.title}
                      src={`https://image.tmdb.org/t/p/w500${guessedMovie?.poster_path}`}
                    />
                  ) : (
                    <></>
                  )}
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      {/* Footer */}
      <Footer />

      {isCellClicked ? (
        <div
          className="fixed inset-0 flex items-center justify-center bg-white/50"
          onClick={() => handleClose()}
        >
          <div
            className="bg-slate-800 px-8 py-8 flex flex-col items-center justify-center relative rounded-md w-96"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute top-3 right-3 cursor-pointer"
              onClick={() => handleClose()}
            >
              X
            </button>
            <p className="text-slate-400 text-xl mb-6">Enter your guess</p>

            {selectedMovie ? (
              <div className="flex justify-start items-center p-2 gap-2 w-full bg-blue-500 mb-4 rounded-md">
                {selectedMovie.poster_path ? (
                  <img
                    src={`https://image.tmdb.org/t/p/w92${selectedMovie.poster_path}`}
                    alt={selectedMovie.title}
                    className=" h-16 aspect-[2/3] object-cover rounded-sm"
                  />
                ) : (
                  <div className="h-16 aspect-[2/3] bg-slate-600 rounded-sm flex flex-col items-center justify-center text-[10px] text-slate-400 font-bold border border-slate-500/30 shrink-0 select-none">
                    🎬 <span>NO PIC</span>
                  </div>
                )}
                <p>{selectedMovie.title}</p>
              </div>
            ) : (
              <></>
            )}
            <input
              type="text"
              placeholder="Search for movies..."
              autoFocus
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              autoComplete="off"
              className="rounded-md p-2 bg-slate-600 w-full grow mb-4"
            />

            {searchValue ? (
              searchMovies.length > 0 ? (
                <div className="flex flex-col items-start h-[243px] overflow-y-auto mb-4 rounded-md border border-slate-400 w-full">
                  {searchMovies.map((searchMovie) => (
                    <button
                      key={searchMovie.id}
                      onClick={() =>
                        handleSelectMovieFromSearch(searchMovie.id)
                      }
                      className="flex justify-start items-center p-2 gap-2 cursor-pointer border-b border-b-slate-400 w-full"
                    >
                      {searchMovie.poster_path ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w92${searchMovie.poster_path}`}
                          alt={searchMovie.title}
                          className=" h-16 aspect-[2/3] object-cover rounded-sm"
                        />
                      ) : (
                        <div className="h-16 aspect-[2/3] bg-slate-600 rounded-sm flex flex-col items-center justify-center text-[10px] text-slate-400 font-bold border border-slate-500/30 shrink-0 select-none">
                          🎬 <span>NO PIC</span>
                        </div>
                      )}
                      <p>{searchMovie.title}</p>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="flex justify-center items-center p-2 border border-slate-400 w-full text-slate-400 mb-4 rounded-md">
                  <p>No results found.</p>
                </div>
              )
            ) : (
              <></>
            )}

            <button
              className={
                selectedMovie
                  ? "bg-green-500 cursor-pointer text-white p-2 w-full rounded-md hover:bg-green-700"
                  : "text-white bg-slate-400 p-2 w-full rounded-md cursor-not-allowed"
              }
              disabled={!selectedMovie}
              onClick={() => {
                if (selectedMovie) {
                  handleChooseMovie(selectedMovie);
                }
              }}
            >
              Choose
            </button>
          </div>
        </div>
      ) : (
        <></>
      )}
    </div>
  );
};

export default SinglePlayerGame;
