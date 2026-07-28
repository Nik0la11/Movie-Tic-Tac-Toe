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

const SinglePlayerGame = () => {
  const columns = ["Leonardo Di Caprio", "Brad Pitt", "Decade: 1990"];
  const rows = ["Christopher Nolan", "Oppenheimer", "David Fincher"];

  const [cells, setCells] = useState<Cell[]>(
    Array.from({ length: 9 }, (_, index) => ({
      id: index,
      status: "empty",
      movieTitle: "",
      claimedBy: null,
    }))
  );

  const handleClick = (cellId: number) => {
    console.log(`Kliknuto je polje sa ID: ${cellId}`);
  };

  useEffect(() => {
    async function testAPI() {
      console.log("Zapocinjem generisanje grida: ");
      const res = await generateRandomGrid();
      console.log(res);
    }

    testAPI();
  }, []);

  return (
    <div className="flex flex-col items-center justiy-center min-h-screen bg-slate-950">
      {/* Header */}
      <header className="text-center mb-10 p-3 border-b w-full">
        <h1 className="text-2xl font-extrabold tracking-tighter">
          Movie Tic - Tac - Toe
        </h1>
      </header>

      {/* Grid */}
      <div className="grid grid-cols-4 gap-1 max-w-md w-full mx-auto md:ml-122">
        <div className="bg-transparent p-4"></div>

        {columns.map((col, index) => (
          <div
            key={index}
            className="bg-transparent flex items-center justify-center p-4 break-words leading-tight text-l text-center"
          >
            {col}
          </div>
        ))}

        {rows.map((rowName, rowIndex) => (
          <React.Fragment key={rowIndex}>
            <div className="bg-transparent flex items-center justify-center p-4 break-words leading-tight aspect-[2/3] text-l text-center">
              {rowName}
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
      <footer className="p-2 w-full justify-between text-center text-xs text-slate-400 flex items-center">
        <div>
          <p>© {new Date().getFullYear()} Movie Tic-Tac-Toe. Made by Retard.</p>
        </div>

        <div className="flex sm:flex-row items-center justify-center gap-2 max-w-md opacity-70 hover:opacity-100 transition-opacity duration-300">
          <p className="text-xs text-slate-400">Powered by</p>
          <img src="/tmdb-logo.png" alt="TMDb Logo" className="w-12 h-auto" />
        </div>
      </footer>
    </div>
  );
};

export default SinglePlayerGame;
