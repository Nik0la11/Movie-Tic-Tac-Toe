"use client";

import React, { useState } from "react";
import { useEffect } from "react";
import { generateRandomGrid } from "@/utils/tmdb";

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
}

const SinglePlayerGame = () => {
  const [gridData, setGridData] = useState<{
    rows: string[];
    cols: string[];
  } | null>(null);

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

  const handleClick = (cellId: number) => {
    console.log(`Kliknuto je polje sa ID: ${cellId}`);
    setIsCellClicked(true);
  };

  useEffect(() => {
    function testGrid() {
      console.log("Zapocinjem generisanje grida: ");
      const res = generateRandomGrid();
      console.log(`kolone: ${res?.cols}, redovi: ${res?.rows}`);
      setGridData(res as { rows: string[]; cols: string[] });
    }

    testGrid();
  }, []);

  useEffect(() => {
    const fetchMovies = async () => {
      if (searchValue.trim().length < 2) return;

      const searchEncodedValue = encodeURIComponent(searchValue.trim());

      const endpoint = "/search/movie";
      const params = `&query=${searchEncodedValue}&include_adult=false&language=en-US`;

      const res = await fetch(
        `/api/movies?endpoint=${endpoint}&params=${encodeURIComponent(params)}`
      );
      const data = await res.json();
      setSearchMovies(data.results);
    };

    fetchMovies();
  }, [searchValue]);

  const handleClose = () => {
    setIsCellClicked(false);
    setSearchValue("");
  };

  if (!gridData) {
    return <div className="h-screen overflow-hidden"></div>;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950">
      {/* Header */}
      <header className="text-center mb-5 p-3 border-b w-full">
        <h1 className="text-2xl font-extrabold tracking-tighter">
          Movie Tic - Tac - Toe
        </h1>
      </header>

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

              return (
                <button
                  onClick={() => handleClick(cellId)}
                  key={cellId}
                  className="cursor-pointer bg-slate-800 flex items-center justify-center p-4 break-words leading-tight aspect-[2/3] text-l"
                ></button>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      {/* Footer */}
      <footer className="px-2 w-full justify-between text-center text-xs text-slate-400 flex items-center mt-4">
        <div>
          <p>© {new Date().getFullYear()} Movie Tic-Tac-Toe. Made by Retard.</p>
        </div>

        <div className="flex sm:flex-row items-center justify-center gap-2 max-w-md opacity-70 hover:opacity-100 transition-opacity duration-300">
          <p className="text-xs text-slate-400">Powered by</p>
          <img src="/tmdb-logo.png" alt="TMDb Logo" className="w-12 h-auto" />
        </div>
      </footer>

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

            <input
              type="text"
              placeholder="Search for movies..."
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
              className="text-white bg-slate-400 p-2 w-full rounded-md cursor-not-allowed hover:bg-green-500 cursor-pointer"
              disabled
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
