"use client";

import React, { useState } from "react";
import { useEffect } from "react";
import { generateRandomGrid } from "@/utils/tmdb";
import { io, Socket } from "socket.io-client";
import Footer from "@/app/components/Footer";
import Header from "@/app/components/Header";
import { useParams } from "next/navigation";
import { useRef } from "react";

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

const MultiPlayerGame = () => {
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
  const [selectedMovie, setSelectedMovie] = useState<Movie | null>(null);
  const [clickedCell, setClickedCell] = useState<number | null>(null);
  const [cellRow, setCellRow] = useState("");
  const [cellCol, setCellCol] = useState("");
  const [gridGuesses, setGridGuesses] = useState<
    Record<number, { poster_path: string; title: string; claimedBy: "X" | "O" }>
  >({});
  const [role, setRole] = useState("X");
  const socketRef = useRef<Socket | null>(null);

  const params = useParams();
  const roomID = params.roomId as string;

  useEffect(() => {
    socketRef.current = io("http://localhost:4000");

    const socket = socketRef.current;

    socket.on("connect", () => {
      socket.emit("join_room", roomID);
    });

    socket.on("room_error", (msg: string) => {
      console.log(msg);
    });

    socket.on("room_joined", (data: { role: "X" | "O" }) => {
      console.log(data.role);
    });

    socket.on("waiting", (msg: string) => {
      console.log(msg);
    });

    socket.on("game_start", ({ currentTurn, grid }) => {
      console.log(currentTurn);
      setGridData({
        rows: grid.rows,
        cols: grid.cols,
      });
    });

    socket.on("receive_move", ({ cellIndex, isCorrect, movie, claimedBy }) => {
      if (isCorrect) {
        setGridGuesses((prev) => ({
          ...prev,
          [cellIndex]: {
            poster_path: movie.poster_path,
            title: movie.title,
            claimedBy: claimedBy,
          },
        }));
      }
      console.log(movie);
      console.log(claimedBy);
      console.log(cellIndex);
    });

    return () => {
      socket.off("connect");
      socket.off("room_error");
      socket.off("room_joined");
      socket.off("game_start");
      socket.off("receive_move");
      socket.disconnect();
    };
  }, [roomID]);

  const handleClick = (cellId: number, rowName: string, colName: string) => {
    console.log(`Kliknuto je polje sa ID: ${cellId}`);
    setIsCellClicked(true);
    setClickedCell(cellId);
    setCellRow(rowName);
    setCellCol(colName);
  };

  /*useEffect(() => {
    function testGrid() {
      console.log("Zapocinjem generisanje grida: ");
      const res = generateRandomGrid();
      console.log(`kolone: ${res?.cols}, redovi: ${res?.rows}`);
      setGridData(res as { rows: string[]; cols: string[] });
    }

    testGrid();
  }, []);
*/

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
    setSelectedMovie(null);
  };

  const handleSelectMovieFromSearch = async (movieId: number) => {
    try {
      const endpoint = `/movie/${movieId}`;
      const params = "&append_to_response=credits";

      const res = await fetch(
        `/api/movies?endpoint=${endpoint}&params=${encodeURIComponent(params)}`
      );
      const data = await res.json();
      console.log(data);

      const directorObject = data.credits.crew.find(
        (member: any) => member.job === "Director"
      );

      const releaseYear = parseInt(data.release_date.split("-")[0]);
      const decade = `${Math.floor(releaseYear / 10) * 10}s`;
      const genres: string[] = data.genres.map((genre: any) => genre.name);
      const actors: string[] = data.credits.cast
        .slice(0, 4)
        .map((actor: any) => actor.name);

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
          if (!socketRef.current) return;

          socketRef.current.emit("make_move", {
            roomID,
            cellIndex: clickedCell,
            isCorrect: true,
            movie: {
              poster_path: movie.poster_path,
              title: movie.title,
            },
            claimedBy: role,
          });
        } else {
          if (!socketRef.current) return;

          socketRef.current.emit("make_move", {
            roomID,
            cellIndex: clickedCell,
            isCorrect: false,
            claimedBy: role,
          });
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
          if (!socketRef.current) return;

          socketRef.current.emit("make_move", {
            roomID,
            cellIndex: clickedCell,
            isCorrect: true,
            movie: {
              poster_path: movie.poster_path,
              title: movie.title,
            },
            claimedBy: role,
          });
        } else {
          if (!socketRef.current) return;

          socketRef.current.emit("make_move", {
            roomID,
            cellIndex: clickedCell,
            isCorrect: false,
            claimedBy: role,
          });
        }
        break;
      }

      case rowType === "decade" && colType === "actor": {
        if (
          movie.actors.some((actor) => actor === colValue) &&
          movie.decade === rowValue
        ) {
          if (!socketRef.current) return;

          socketRef.current.emit("make_move", {
            roomID,
            cellIndex: clickedCell,
            isCorrect: true,
            movie: {
              poster_path: movie.poster_path,
              title: movie.title,
            },
            claimedBy: role,
          });
        } else {
          if (!socketRef.current) return;

          socketRef.current.emit("make_move", {
            roomID,
            cellIndex: clickedCell,
            isCorrect: false,
            claimedBy: role,
          });
        }
        break;
      }

      case rowType === "decade" && colType === "director": {
        if (movie.director === colValue && movie.decade === rowValue) {
          if (!socketRef.current) return;

          socketRef.current.emit("make_move", {
            roomID,
            cellIndex: clickedCell,
            isCorrect: true,
            movie: {
              poster_path: movie.poster_path,
              title: movie.title,
            },
            claimedBy: role,
          });
        } else {
          if (!socketRef.current) return;
          socketRef.current.emit("make_move", {
            roomID,
            cellIndex: clickedCell,
            isCorrect: false,
            claimedBy: role,
          });
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

  if (!gridData) {
    return <div className="h-screen overflow-hidden"></div>;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950">
      {/* Header */}

      <Header />

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

export default MultiPlayerGame;
