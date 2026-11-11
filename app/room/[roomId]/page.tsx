"use client";

import React, { useState } from "react";
import { useEffect } from "react";
import { io, Socket } from "socket.io-client";
import Footer from "@/app/components/Footer";
import Header from "@/app/components/Header";
import { useParams } from "next/navigation";
import { useRef } from "react";
import { Copy } from "lucide-react";
import Link from "next/link";
import {
  getPlayerId,
  getRoomSettings,
  hasJoinedRoom,
  looksLikeBot,
  markRoomJoined,
  whenPageIsShown,
} from "@/utils/roomSession";

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

interface GameResult {
  winner: "X" | "O" | "DRAW";
  winningLine: number[];
}

type BoardCell = {
  poster_path: string;
  title: string;
  claimedBy: "X" | "O";
} | null;

type RoomStatus = "connecting" | "invite" | "waiting" | "playing" | "error";

// Stanje tajmera poteza koje salje server
interface TurnTimer {
  turn: "X" | "O";
  turnSeconds: number | null; // null = bez ogranicenja
  timeLeftMs: number | null;
  paused: boolean; // vrijeme stoji dok je neko odspojen
}

// TODO: rezultat serije je zasad hardkodovan, logika dolazi kasnije
const SCORE_YOU = 0;
const SCORE_OPP = 0;

// 35000 ms -> "0:35"
const formatTimeLeft = (ms: number) => {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

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
  const [gridGuesses, setGridGuesses] = useState<
    Record<number, { poster_path: string; title: string; claimedBy: "X" | "O" }>
  >({});
  const [role, setRole] = useState("X");
  const socketRef = useRef<Socket | null>(null);
  // Da li ovaj tab treba da zauzme mjesto u sobi. Kreator ulazi automatski,
  // a ostali tek kad kliknu "Join game" - tako programi koji sami otvore link
  // (preview u Viber/Messenger-u, prerender u browseru) ne zauzmu mjesto.
  const joinRequestedRef = useRef(false);
  const playerIdRef = useRef("");
  const [currentTurn, setCurrentTurn] = useState<"X" | "O" | null>(null);
  const [roomStatus, setRoomStatus] = useState<RoomStatus>("connecting");
  const [roomError, setRoomError] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [slowConnection, setSlowConnection] = useState(false);
  const [playersOnline, setPlayersOnline] = useState({ X: true, O: true });
  const [currentUrl, setCurrentUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [gameResult, setGameResult] = useState<GameResult | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  // Preostalo vrijeme od servera + lokalni trenutak kad je stiglo
  const [turnTimer, setTurnTimer] = useState<
    (Omit<TurnTimer, "turn"> & { syncedAt: number }) | null
  >(null);
  const [now, setNow] = useState(() => Date.now());

  const params = useParams();
  const roomID = params.roomId as string;

  useEffect(() => {
    const playerId = getPlayerId();
    playerIdRef.current = playerId;

    // Besplatni Render server se budi i do minut, zato ne odustajemo od povezivanja
    const socket = io(
      process.env.NEXT_PUBLIC_SOCKET_URL ?? "http://localhost:4000",
      {
        transports: ["polling", "websocket"],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
      }
    );
    socketRef.current = socket;

    // settings postoje samo kod kreatora (sacuvani na /room pri kreiranju)
    const emitJoin = () =>
      socket.emit("join_room", {
        roomID,
        playerId,
        settings: getRoomSettings(roomID),
      });

    const joinNow = () => {
      joinRequestedRef.current = true;
      if (socket.connected) emitJoin();
      // Ako jos nije povezan, join_room se salje u "connect" handleru
    };

    const applyTimer = (timer: TurnTimer) => {
      setCurrentTurn(timer.turn);
      setTurnTimer({
        turnSeconds: timer.turnSeconds,
        timeLeftMs: timer.timeLeftMs,
        paused: timer.paused,
        syncedAt: Date.now(),
      });
    };

    let stopWaiting = () => {};

    if (hasJoinedRoom(roomID)) {
      // Kreator sobe ili igrac koji je vec bio u sobi (refresh)
      joinNow();
    } else if (looksLikeBot()) {
      // Vjerovatno program koji pravi pregled linka - ne zauzima mjesto.
      // Ako je ipak covjek, moze da klikne "Join game".
      setRoomStatus("invite");
    } else {
      // Pravi posjetilac: ulazi automatski cim stranica stvarno bude prikazana
      stopWaiting = whenPageIsShown(joinNow);
    }

    // Ako povezivanje traje duze od par sekundi, objasni korisniku zasto
    const slowTimer = setTimeout(() => setSlowConnection(true), 4000);

    socket.on("connect", () => {
      setIsConnected(true);
      setSlowConnection(false);
      clearTimeout(slowTimer);
      // Salje se i pri svakom ponovnom povezivanju - server nas vraca na isto mjesto
      if (joinRequestedRef.current) emitJoin();
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    socket.on("room_error", (msg: string) => {
      setRoomError(msg);
      setRoomStatus("error");
      socket.disconnect();
    });

    socket.on("room_joined", (data: { role: "X" | "O" }) => {
      setRole(data.role);
      markRoomJoined(roomID);
    });

    socket.on("waiting", () => {
      setRoomStatus("waiting");
    });

    socket.on(
      "game_start",
      ({
        currentTurn,
        grid,
        board,
        result,
        players,
        timer,
      }: {
        currentTurn: "X" | "O";
        grid: { rows: string[]; cols: string[] };
        board: BoardCell[];
        result: GameResult | null;
        players: { X: boolean; O: boolean };
        timer: TurnTimer;
      }) => {
        setGridData({ rows: grid.rows, cols: grid.cols });
        setCurrentTurn(currentTurn);
        applyTimer(timer);

        // Tabla sa servera (bitno kad se igrac vrati usred igre)
        const guesses: Record<
          number,
          { poster_path: string; title: string; claimedBy: "X" | "O" }
        > = {};
        board.forEach((cell, index) => {
          if (cell) guesses[index] = cell;
        });
        setGridGuesses(guesses);

        setGameResult(result);
        setPlayersOnline(players);
        setRoomStatus("playing");
      }
    );

    socket.on("players_status", (players: { X: boolean; O: boolean }) => {
      setPlayersOnline(players);
    });

    socket.on(
      "receive_move",
      ({ cellIndex, isCorrect, movie, claimedBy, nextTurn, timer }) => {
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

        setCurrentTurn(nextTurn);
        applyTimer(timer);
      }
    );

    // Promjena reda bez poteza (isteklo vrijeme ili skip) i pauza/nastavak tajmera
    socket.on("turn_timer", (timer: TurnTimer) => {
      applyTimer(timer);
    });

    socket.on("game_end", (result: GameResult) => {
      setGameResult(result);
    });

    socket.on("move_rejected", ({ reason }: { reason: string }) => {
      setMoveError(reason);
      setTimeout(() => setMoveError(null), 3000);
    });

    return () => {
      stopWaiting();
      clearTimeout(slowTimer);
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [roomID]);

  // Samo za rijedak slucaj kad looksLikeBot() pogrijesi za pravog korisnika
  const handleJoinGame = () => {
    joinRequestedRef.current = true;
    setRoomStatus("connecting");

    const socket = socketRef.current;
    if (socket?.connected) {
      socket.emit("join_room", {
        roomID,
        playerId: playerIdRef.current,
        settings: getRoomSettings(roomID),
      });
    }
    // Ako jos nije povezan, join_room se salje u "connect" handleru
  };

  // Odbrojavanje: osvjezava prikaz dok tajmer radi
  const timerRunning =
    turnTimer?.timeLeftMs != null && !turnTimer.paused && !gameResult;

  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [timerRunning]);

  const timeLeftMs =
    turnTimer?.timeLeftMs == null
      ? null
      : turnTimer.paused
      ? turnTimer.timeLeftMs
      : Math.max(
          0,
          turnTimer.timeLeftMs - Math.max(0, now - turnTimer.syncedAt)
        );

  const isMyTurn = currentTurn === role;

  const handleClick = (cellId: number) => {
    console.log(`Kliknuto je polje sa ID: ${cellId}`);
    setIsCellClicked(true);
    setClickedCell(cellId);
    setSearchValue("");
    setSelectedMovie(null);
  };

  const handleSkip = () => {
    socketRef.current?.emit("skip_turn");
    setIsCellClicked(false);
  };

  useEffect(() => {
    const URL = window.location.href;
    setCurrentUrl(URL);
  }, []);

  const handleCopyLink = async () => {
    try {
      if (typeof window !== undefined) {
        setCopied(true);
        navigator.clipboard.writeText(currentUrl);

        setTimeout(() => setCopied(false), 2000);
      }
    } catch (err) {
      console.error("Greska u kopiranju linka", err);
    }
  };

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

  const handleSelectMovieFromSearch = (movie: Movie) => {
    setSelectedMovie({
      id: movie.id,
      title: movie.title,
      poster_path: movie.poster_path,
    });
    setSearchValue("");
  };

  // Server provjerava film preko TMDB-a i odlucuje da li je potez tacan
  const handleChooseMovie = (movie: Movie) => {
    if (!socketRef.current || clickedCell === null) return;

    socketRef.current.emit("make_move", {
      cellIndex: clickedCell,
      movieId: movie.id,
    });

    setIsCellClicked(false);
    setSearchValue("");
    setSelectedMovie(null);
  };

  const opponent = role === "X" ? "O" : "X";
  const opponentOnline = playersOnline[opponent as "X" | "O"];

  if (roomStatus === "error") {
    return (
      <div className="flex flex-col items-center justify-between min-h-screen bg-slate-950">
        <Header />
        <div className="flex flex-col items-center justify-center gap-4 px-4 text-center">
          <h1 className="text-3xl">{roomError}</h1>
          <Link
            href="/room"
            className="rounded-md py-2 px-8 bg-blue-500 hover:bg-blue-700"
          >
            Create a new room
          </Link>
        </div>
        <Footer />
      </div>
    );
  }

  if (roomStatus === "invite") {
    return (
      <div className="flex flex-col items-center justify-between min-h-screen bg-slate-950">
        <Header />
        <div className="flex flex-col items-center justify-center gap-4 px-4 text-center">
          <h1 className="text-3xl">You have been invited to a game!</h1>
          <div className="flex justify-center items-center gap-2">
            <h3 className="text-xl uppercase text-slate-400">ROOM CODE:</h3>
            <h3 className="text-xl uppercase">{roomID}</h3>
          </div>
          <button
            onClick={handleJoinGame}
            className="rounded-md py-2 px-8 bg-blue-500 hover:bg-blue-700 cursor-pointer text-xl"
          >
            Join game
          </button>
        </div>
        <Footer />
      </div>
    );
  }

  if (roomStatus === "connecting") {
    return (
      <div className="flex flex-col items-center justify-between min-h-screen bg-slate-950">
        <Header />
        <div className="flex flex-col items-center justify-center gap-3 px-4 text-center">
          <h1 className="text-2xl">Connecting to game server...</h1>
          {slowConnection && (
            <p className="text-slate-400 max-w-md">
              The server may be waking up, this can take up to a minute. Keep
              this page open.
            </p>
          )}
        </div>
        <Footer />
      </div>
    );
  }

  if (roomStatus === "waiting") {
    return (
      <div className="flex flex-col items-center justify-between min-h-screen bg-slate-950">
        <Header />
        <div className="flex flex-col items-center justify-center bg-slate-950 gap-4">
          <div className="flex justify-center items-center gap-2">
            <h3 className="text-xl uppercase text-slate-400">ROOM CODE:</h3>
            <h3 className="text-xl uppercase">{roomID}</h3>
          </div>
          <h1 className="text-4xl">Share this link with a friend:</h1>
          <button
            onClick={() => handleCopyLink()}
            className=" flex items-center justify-center gap-2 cursor-pointer rounded-md p-2 bg-blue-500"
          >
            <h2 className="text-xl  ">Copy link: {currentUrl}</h2>
            <Copy className="w-5 h-5" />
          </button>

          <div
            className={`fixed top-20 rounded-md p-3 bg-blue-500 font-semibold text-sm transtion-all ease-in duration-300 ${
              copied ? "opacity-100" : "opacity-0"
            }`}
          >
            URL copied to clipboard
          </div>

          <h3 className="text-xl text-slate-400">
            The game will start when you friend joins
          </h3>
        </div>
        <Footer />
      </div>
    );
  }

  if (!gridData) return null;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950">
      {/* Header */}

      <Header />

      {/* Iznad grida: rezultat + tajmer lijevo (poravnato sa kolonom kategorija),
          ko je na potezu / skip desno (poravnato sa desnom ivicom grida).
          Ista sirina i pomjeraj kao grid. */}
      {/* Na telefonu: manja slova i razmaci, a tekst se nikad ne lomi u novi red
          (whitespace-nowrap). Od sm (640px) naviše sve je kao na desktopu. */}
      <div className="flex items-center justify-between gap-2 sm:gap-3 mb-3 max-w-md w-full mx-auto md:ml-122 text-sm sm:text-base whitespace-nowrap">
        {/* Tajmer je zalijepljen uz rezultat (bez razmaka, iste visine) */}
        <div className="flex items-stretch shrink-0">
          {/* Rezultat serije - TODO: zasad hardkodovan, logika dolazi kasnije.
              Pozadina kao polja grida (slate-800), YOU/OPP malo svjetlije (slate-700).
              Uspravna linija u boji igraca (X crveni, O plavi): lijevo od YOU, desno od OPP. */}
          <div
            className={`flex items-stretch overflow-hidden bg-slate-800 text-white ${
              // Kad je tajmer prikazan, desni ugao ostaje ravan da se spoje
              !gameResult && timeLeftMs != null ? "rounded-l-md" : "rounded-md"
            }`}
          >
            <span
              className={`flex items-center border-l-4 bg-slate-700 px-2 sm:px-3 py-1 font-normal ${
                role === "X" ? "border-red-500" : "border-blue-500"
              }`}
            >
              YOU
            </span>
            <span className="flex items-center px-2 sm:px-4 py-1 font-semibold tabular-nums">
              {SCORE_YOU} : {SCORE_OPP}
            </span>
            <span
              className={`flex items-center border-r-4 bg-slate-700 px-2 sm:px-3 py-1 font-normal ${
                role === "X" ? "border-blue-500" : "border-red-500"
              }`}
            >
              OPP
            </span>
          </div>

          {!gameResult && timeLeftMs != null && (
            <span
              className={`flex items-center rounded-r-md bg-slate-800 px-2 sm:px-3 py-1 font-semibold tabular-nums ${
                turnTimer?.paused
                  ? "text-slate-500"
                  : timeLeftMs <= 5000
                  ? "text-red-500"
                  : "text-white"
              }`}
              title={turnTimer?.paused ? "Paused" : undefined}
            >
              {formatTimeLeft(timeLeftMs)}
            </span>
          )}
        </div>

        {gameResult ? (
          <span
            className={`shrink-0 rounded-md px-3 sm:px-4 py-1 font-semibold text-white ${
              gameResult.winner === "DRAW"
                ? "bg-slate-600"
                : gameResult.winner === role
                ? "bg-green-600"
                : "bg-red-600"
            }`}
          >
            {gameResult.winner === "DRAW"
              ? "It's a draw!"
              : gameResult.winner === role
              ? "You won!"
              : "You lost!"}
          </span>
        ) : isMyTurn ? (
          // "Your turn" i "Skip" spojeni u jedan blok
          <div className="flex items-stretch shrink-0 font-semibold text-white">
            <span className="rounded-l-md bg-blue-500 px-2 sm:px-4 py-1">
              Your turn
            </span>
            <button
              onClick={handleSkip}
              disabled={!isConnected || !opponentOnline}
              className="rounded-r-md bg-red-500 px-2 sm:px-4 py-1 cursor-pointer hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Skip
            </button>
          </div>
        ) : (
          <span className="shrink-0 rounded-md bg-slate-600 px-3 sm:px-4 py-1 font-semibold text-white">
            Their turn
          </span>
        )}
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

              const guessedMovie = gridGuesses[cellId];
              const isWinningCell =
                gameResult?.winningLine.includes(cellId) ?? false;

              return (
                <button
                  onClick={() => handleClick(cellId)}
                  key={cellId}
                  disabled={
                    !!guessedMovie ||
                    role != currentTurn ||
                    !!gameResult ||
                    !isConnected ||
                    !opponentOnline
                  }
                  className={`relative cursor-pointer disabled:cursor-default bg-slate-800 flex items-center justify-center p-4 break-words leading-tight aspect-[2/3] text-l transition-all duration-300 ${
                    isWinningCell
                      ? "ring-4 ring-yellow-400 z-10 scale-105"
                      : gameResult && gameResult.winner !== "DRAW"
                      ? "opacity-50"
                      : ""
                  }`}
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
                  {guessedMovie?.claimedBy && (
                    <div
                      className={`absolute inset-0 flex items-center justify-center transition-all duration-300 ${
                        guessedMovie?.claimedBy === "X"
                          ? "bg-red-800/50 text-red-500"
                          : "bg-blue-800/50 text-blue-500"
                      }`}
                    >
                      <span className="text-6xl font-black">
                        {guessedMovie?.claimedBy}
                      </span>
                    </div>
                  )}
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>

      {!isConnected ? (
        <p className="mt-4 text-yellow-400">Connection lost, reconnecting...</p>
      ) : (
        !opponentOnline &&
        !gameResult && (
          <p className="mt-4 text-yellow-400">
            Opponent disconnected, waiting for them to come back...
          </p>
        )
      )}

      {moveError && (
        <div className="fixed top-20 rounded-md p-3 bg-red-600 font-semibold text-sm">
          {moveError}
        </div>
      )}

      {/* Footer */}
      <Footer />

      {/* Prozor za pogadjanje se zatvara cim red predje na protivnika (npr. isteklo vrijeme) */}
      {isCellClicked && isMyTurn && !gameResult ? (
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
            {/* Odbrojavanje i ovdje, jer prozor pokriva tajmer iznad grida */}
            {timeLeftMs != null && (
              <span
                className={`absolute top-3 left-4 font-bold tabular-nums ${
                  timeLeftMs <= 5000 ? "text-red-500" : "text-white"
                }`}
              >
                {formatTimeLeft(timeLeftMs)}
              </span>
            )}
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
