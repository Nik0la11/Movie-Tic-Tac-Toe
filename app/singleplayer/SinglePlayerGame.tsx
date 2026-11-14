"use client";

import React, { useEffect, useRef, useState } from "react";
import Footer from "../components/Footer";
import Header from "../components/Header";
import { msUntilNextGrid, todayUTC } from "@/utils/dailyDate";
import { gridPosterUrl, preloadGridPoster } from "@/utils/poster";

// Rezultat pretrage filmova
interface Movie {
  id: number;
  title: string;
  poster_path: string | null;
}

// Dnevni grid: isti za sve igrace tog dana. Pravi ga server (page.tsx ili
// /api/grid), a browser dobija samo nazive redova i kolona.
export interface DailyGrid {
  rows: string[];
  cols: string[];
  date: string; // "2026-11-13" (UTC)
  number: number; // redni broj dnevnog grida, za "Share"
}

// Pogodjeno polje -> film (id sluzi da se isti film ne upise dva puta)
type Guesses = Record<
  number,
  { id?: number; poster_path: string | null; title: string }
>;

// Koliko filmova igrac moze da izabere (tacnih i netacnih) za jedan grid
const MAX_GUESSES = 9;

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

// 🟩 pogodjeno, ⬜ nije (za "Share" i prozor sa rezultatom)
const resultRows = (guesses: Guesses) =>
  [0, 1, 2].map((r) =>
    [0, 1, 2].map((c) => (guesses[r * 3 + c] ? "🟩" : "⬜")).join("")
  );

// initialGrid stize sa servera zajedno sa stranicom, pa se grid vidi odmah
// (bez praznog ekrana dok se ceka /api/grid)
const SinglePlayerGame = ({ initialGrid }: { initialGrid: DailyGrid }) => {
  const [gridData, setGridData] = useState<DailyGrid>(initialGrid);
  // Broj izabranih filmova (tacnih i netacnih) za danasnji grid
  const [attempts, setAttempts] = useState(0);
  const [gridGuesses, setGridGuesses] = useState<Guesses>({});
  const [shareCopied, setShareCopied] = useState(false);
  // Za koji datum je napredak iz localStorage vec ucitan. Dok nije, napredak
  // se ne cuva (da prazna tabla ne prepise sacuvana pogodjena polja).
  const [progressDate, setProgressDate] = useState<string | null>(null);
  // null dok se stranica ne pokrene u browseru: sat servera i browsera se
  // razlikuju, pa bi odbrojavanje u HTML-u sa servera bilo pogresno
  const [now, setNow] = useState<number | null>(null);

  const [isCellClicked, setIsCellClicked] = useState(false);
  const [clickedCell, setClickedCell] = useState<number | null>(null);
  const [searchValue, setSearchValue] = useState("");
  const [searchMovies, setSearchMovies] = useState<Movie[]>([]);
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  // Server provjerava film (dugme "Choose" je zakljucano)
  const [checking, setChecking] = useState(false);

  // Kratka poruka iznad grida, npr. "Inception doesn't fit"
  const [feedback, setFeedback] = useState<string | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Polje koje se trese posle netacnog filma (key ponovo pokrece animaciju)
  const [shake, setShake] = useState<{ cell: number; key: number } | null>(
    null
  );
  // Prozor sa rezultatom na kraju igre
  const [showResults, setShowResults] = useState(false);

  const solvedCount = Object.keys(gridGuesses).length;
  const guessesLeft = Math.max(0, MAX_GUESSES - attempts);
  // Kraj: sve pogodjeno ili nema vise pokusaja
  const isGameOver = solvedCount === 9 || attempts >= MAX_GUESSES;

  // Danasnji datum u browseru (prije pokretanja: datum grida sa servera)
  const currentDate = now == null ? initialGrid.date : todayUTC(now);

  useEffect(() => {
    let cancelled = false;

    const showGrid = (grid: DailyGrid) => {
      const saved = loadProgress(grid);
      setGridGuesses(saved?.guesses ?? {});
      setAttempts(saved?.attempts ?? 0);
      setIsCellClicked(false);
      setShowResults(false);
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

  useEffect(
    () => () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    },
    []
  );

  const showFeedback = (text: string) => {
    setFeedback(text);
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => setFeedback(null), 2500);
  };

  // Rezultat za dijeljenje, npr:
  // Movie Tic Tac Toe #3
  // 🟩🟩⬜
  // ...
  // 6/9 · 9/9 guesses
  const handleShare = async () => {
    const text = [
      `Movie Tic Tac Toe #${gridData.number}`,
      ...resultRows(gridGuesses),
      `${solvedCount}/9 · ${attempts}/${MAX_GUESSES} guesses`,
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

  const handleClick = (cellId: number) => {
    if (isGameOver) return;
    setIsCellClicked(true);
    setClickedCell(cellId);
    setSearchValue("");
    setSelectedMovie(null);
  };

  const handleClose = () => {
    if (checking) return;
    setIsCellClicked(false);
    setSearchValue("");
    setSelectedMovie(null);
  };

  const handleSelectMovieFromSearch = (movie: Movie) => {
    // Poster se skida odmah, da se pojavi cim server potvrdi film
    preloadGridPoster(movie.poster_path);
    setSelectedMovie(movie);
    setSearchValue("");
  };

  // Film provjerava server (/api/check), istim kodom kao multiplayer
  const handleChooseMovie = async (movie: Movie) => {
    if (clickedCell === null || checking || isGameOver) return;
    const cell = clickedCell;

    // Isti film samo jednom na tabli (ne trosi pokusaj)
    if (Object.values(gridGuesses).some((g) => g.id === movie.id)) {
      showFeedback(`${movie.title} is already on the board`);
      setSelectedMovie(null);
      return;
    }

    setChecking(true);
    let data: {
      correct: boolean;
      movie: { id: number; title: string; poster_path: string | null };
    };
    try {
      const res = await fetch("/api/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: gridData.date,
          cellIndex: cell,
          movieId: movie.id,
        }),
      });
      data = await res.json();
      if (!res.ok) throw new Error((data as unknown as { error: string }).error);
    } catch (err) {
      // Greska servera/TMDB-a ne trosi pokusaj
      console.error("Greska pri provjeri filma", err);
      showFeedback("Could not check the movie, try again");
      setChecking(false);
      return;
    }

    setChecking(false);
    setIsCellClicked(false);
    setSearchValue("");
    setSelectedMovie(null);

    // Svaki provjeren film je pokusaj, tacan ili ne
    const newAttempts = attempts + 1;
    let newSolved = solvedCount;
    setAttempts(newAttempts);

    if (data.correct) {
      newSolved++;
      setGridGuesses((prev) => ({
        ...prev,
        [cell]: {
          id: data.movie.id,
          poster_path: data.movie.poster_path,
          title: data.movie.title,
        },
      }));
    } else {
      setShake({ cell, key: Date.now() });
      showFeedback(`${data.movie.title} doesn't fit`);
    }

    // Kraj igre: kratka pauza da se vidi poster ili trešenje, pa rezultat
    if (newSolved === 9 || newAttempts >= MAX_GUESSES) {
      setTimeout(() => setShowResults(true), 700);
    }
  };

  // Isti film samo jednom na tabli: vec iskoriscen film ne moze da se izabere
  const usedMovieIds = Object.values(gridGuesses).map((g) => g.id);
  const isSelectedUsed =
    selectedMovie != null && usedMovieIds.includes(selectedMovie.id);
  const canChooseSelected = selectedMovie != null && !isSelectedUsed;

  // Samo za lokalno testiranje (npm run dev): brise danasnji napredak.
  // Na Vercelu (production build) dugme ne postoji.
  const handleResetToday = () => {
    try {
      localStorage.removeItem(progressKey(gridData.date));
    } catch {}
    setGridGuesses({});
    setAttempts(0);
    setShowResults(false);
    setIsCellClicked(false);
  };

  const resultTitle =
    solvedCount === 9
      ? "Perfect grid! 🎉"
      : solvedCount >= 6
      ? "Great job!"
      : solvedCount >= 3
      ? "Nice try!"
      : "Better luck tomorrow!";

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950">
      {/* Header */}

      <Header />

      {/* Dnevni grid: broj, napredak, preostali pokusaji, share */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2 max-w-md w-full mx-auto md:ml-122 px-1 text-sm">
        <div className="flex flex-col">
          <span className="font-semibold text-white">
            Daily grid #{gridData.number}
          </span>
          <span className="text-slate-400">
            {solvedCount}/9 solved ·{" "}
            <span
              className={
                guessesLeft <= 2 && !isGameOver ? "text-red-400" : undefined
              }
            >
              {guessesLeft} {guessesLeft === 1 ? "guess" : "guesses"} left
            </span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          {process.env.NODE_ENV === "development" && (
            <button
              onClick={handleResetToday}
              title="Dev only: reset today's progress"
              className="rounded-md bg-slate-700 px-2 py-1 text-xs text-slate-300 cursor-pointer hover:bg-slate-600"
            >
              Reset
            </button>
          )}
          <span className="text-slate-400">
            {now != null &&
              `Next grid in ${formatCountdown(msUntilNextGrid(now))}`}
          </span>
          {isGameOver ? (
            <button
              onClick={() => setShowResults(true)}
              className="rounded-md bg-emerald-600 px-3 py-1 font-semibold text-white cursor-pointer hover:bg-emerald-700"
            >
              Results
            </button>
          ) : (
            <button
              onClick={handleShare}
              disabled={attempts === 0}
              className="rounded-md bg-emerald-600 px-3 py-1 font-semibold text-white cursor-pointer hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {shareCopied ? "Copied!" : "Share"}
            </button>
          )}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-4 gap-1 max-w-md w-full mx-auto md:ml-122">
        <div className="bg-transparent p-4"></div>

        {gridData.cols.map((col: string, index: number) => (
          <div
            key={index}
            className="bg-transparent flex items-center justify-center p-4 break-words leading-tight text-l text-center "
          >
            {col.split(":")[1]}
          </div>
        ))}

        {gridData.rows.map((rowName: string, rowIndex: number) => (
          <React.Fragment key={rowIndex}>
            <div className="bg-transparent flex items-center justify-center p-4 break-words leading-tight aspect-[2/3] text-l text-center ">
              {rowName.split(":")[1]}
            </div>

            {[0, 1, 2].map((colIndex) => {
              const cellId = rowIndex * 3 + colIndex;
              const guessedMovie = gridGuesses[cellId];
              const isShaking = shake?.cell === cellId;

              return (
                <button
                  onClick={() => handleClick(cellId)}
                  // novi key ponovo pokrece animaciju trešenja
                  key={isShaking ? `${cellId}-${shake.key}` : cellId}
                  onAnimationEnd={() => isShaking && setShake(null)}
                  disabled={!!guessedMovie || isGameOver}
                  // Prazno polje svijetli na hover (kao u multiplayeru)
                  className={`relative cursor-pointer disabled:cursor-default flex items-center justify-center p-4 break-words leading-tight aspect-[2/3] text-l transition-colors duration-200 ${
                    isShaking
                      ? "animate-shake bg-red-900/70"
                      : "bg-slate-800 enabled:hover:bg-slate-700"
                  } ${isGameOver && !guessedMovie ? "opacity-50" : ""}`}
                >
                  {guessedMovie && (
                    <img
                      className="absolute inset-0 w-full h-full object-cover"
                      alt={guessedMovie.title}
                      src={gridPosterUrl(guessedMovie.poster_path)}
                    />
                  )}
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      {/* Footer */}
      <Footer />

      {/* Kratka poruka (netacan film, film vec na tabli, greska) */}
      {feedback && (
        <div
          role="status"
          className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] rounded-md bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-lg whitespace-nowrap"
        >
          {feedback}
        </div>
      )}

      {/* Prozor sa rezultatom na kraju igre */}
      {showResults && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={() => setShowResults(false)}
        >
          <div
            className="animate-pop relative flex w-full max-w-sm flex-col items-center gap-3 rounded-md bg-slate-800 px-6 py-6 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute top-3 right-3 cursor-pointer"
              onClick={() => setShowResults(false)}
            >
              X
            </button>
            <h2 className="text-2xl font-bold text-white">{resultTitle}</h2>
            <p className="text-slate-300">
              Daily grid #{gridData.number}: {solvedCount}/9 solved in{" "}
              {attempts} {attempts === 1 ? "guess" : "guesses"}
            </p>
            <div className="font-mono text-2xl leading-tight">
              {resultRows(gridGuesses).map((row, i) => (
                <div key={i}>{row}</div>
              ))}
            </div>
            <button
              onClick={handleShare}
              className="w-full rounded-md bg-emerald-600 px-4 py-2 font-semibold text-white cursor-pointer hover:bg-emerald-700"
            >
              {shareCopied ? "Copied to clipboard!" : "Share result"}
            </button>
            {now != null && (
              <p className="text-sm text-slate-400">
                Next grid in {formatCountdown(msUntilNextGrid(now))}
              </p>
            )}
          </div>
        </div>
      )}

      {isCellClicked && !isGameOver ? (
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
              <div
                className={`flex justify-start items-center p-2 gap-2 w-full mb-4 rounded-md ${
                  isSelectedUsed ? "bg-slate-600" : "bg-blue-500"
                }`}
              >
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
                <div className="flex flex-col text-left">
                  <p>{selectedMovie.title}</p>
                  {isSelectedUsed && (
                    <p className="text-sm font-semibold text-red-400">
                      Already used on the board
                    </p>
                  )}
                </div>
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
                      onClick={() => handleSelectMovieFromSearch(searchMovie)}
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

            {/* Dok server provjerava, dugme izgleda isto (bez "Checking..."),
                a drugi klik ignorise handleChooseMovie. Film koji je vec na
                tabli ne moze da se izabere: dugme je zatamnjeno. */}
            <button
              className={
                canChooseSelected
                  ? "bg-green-500 cursor-pointer text-white p-2 w-full rounded-md hover:bg-green-700"
                  : "text-white bg-slate-400 p-2 w-full rounded-md cursor-not-allowed opacity-60"
              }
              disabled={!canChooseSelected}
              onClick={() => {
                if (selectedMovie) handleChooseMovie(selectedMovie);
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
