"use client";

import React, { useState } from "react";
import { useEffect } from "react";
import { io, Socket } from "socket.io-client";
import Footer from "@/app/components/Footer";
import Header from "@/app/components/Header";
import { useParams } from "next/navigation";
import { useRef } from "react";
import { Copy, Plus } from "lucide-react";
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
}

// Rezultat serije, broj pobjeda po igracu
type Score = { X: number; O: number };

// Koliko dugo se vidi popup "You won / You lost / Draw" posle partije
// (isto kao NEXT_GAME_DELAY_MS na serveru)
const GAME_POPUP_MS = 1000;


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
  const [score, setScore] = useState<Score>({ X: 0, O: 0 });
  // Cijela serija je gotova (inace je gameResult samo kraj jedne partije)
  const [matchOver, setMatchOver] = useState(false);
  const [gameNumber, setGameNumber] = useState(1);
  // Ko je ponudio nerijeseno u ovoj partiji
  const [drawOfferBy, setDrawOfferBy] = useState<"X" | "O" | null>(null);
  // Drugi klik potvrdjuje ("Are you sure?"). Pamti se stanje u kom je prvi klik
  // bio, pa se potvrda sama ponisti kad se promijeni red, ponuda ili partija.
  const [drawConfirmKey, setDrawConfirmKey] = useState<string | null>(null);
  // Pobjednik upravo zavrsene partije, za popup (null = nema popupa)
  const [gamePopup, setGamePopup] = useState<GameResult["winner"] | null>(
    null
  );
  const popupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

    // Protivnik je izasao i nije se vratio na vrijeme - server je obrisao igru
    socket.on("opponent_left", (msg: string) => {
      setRoomError(msg);
      setRoomStatus("error");
      setIsCellClicked(false);
      socket.disconnect();
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
        score,
        matchWinner,
        gameNumber,
        drawOfferBy,
      }: {
        currentTurn: "X" | "O";
        grid: { rows: string[]; cols: string[] };
        board: BoardCell[];
        // Postavljen kad je partija gotova (pauza prije nove ili kraj serije)
        result: GameResult | null;
        players: { X: boolean; O: boolean };
        timer: TurnTimer;
        score: Score;
        matchWinner: "X" | "O" | null;
        gameNumber: number;
        drawOfferBy: "X" | "O" | null;
      }) => {
        // Stize i za svaku novu partiju u seriji (novi grid, prazna tabla)
        setScore(score);
        setMatchOver(matchWinner != null);
        setGameNumber(gameNumber);
        setDrawOfferBy(drawOfferBy ?? null);
        setIsCellClicked(false);
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

    // Ponuda nerijesenog je data (by = "X"/"O") ili je propala/prihvacena (by = null)
    socket.on("draw_offer", ({ by }: { by: "X" | "O" | null }) => {
      setDrawOfferBy(by);
    });

    // Kraj jedne partije. Tabla ostaje sa pobjednickom linijom; ako serija
    // nije gotova, nakon kratke pauze stize game_start sa novom partijom.
    socket.on(
      "game_end",
      ({
        winner,
        winningLine,
        score,
        matchWinner,
      }: GameResult & { score: Score; matchWinner: "X" | "O" | null }) => {
        setScore(score);

        setGamePopup(winner);
        if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
        popupTimerRef.current = setTimeout(
          () => setGamePopup(null),
          GAME_POPUP_MS
        );

        // Zakljucaj tablu i istakni pobjednicku liniju
        setGameResult({ winner, winningLine });
        setMatchOver(matchWinner != null);
      }
    );

    socket.on("move_rejected", ({ reason }: { reason: string }) => {
      setMoveError(reason);
      setTimeout(() => setMoveError(null), 3000);
    });

    return () => {
      stopWaiting();
      clearTimeout(slowTimer);
      if (popupTimerRef.current) clearTimeout(popupTimerRef.current);
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
    turnTimer?.timeLeftMs != null && !gameResult;

  useEffect(() => {
    if (!timerRunning) return;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [timerRunning]);

  const timeLeftMs =
    turnTimer?.timeLeftMs == null
      ? null
      : Math.max(
          0,
          turnTimer.timeLeftMs - Math.max(0, now - turnTimer.syncedAt)
        );

  const isMyTurn = currentTurn === role;
  // Mora biti definisano prije drawButton (i svega sto ih koristi ispod)
  const opponent = role === "X" ? "O" : "X";
  const opponentOnline = playersOnline[opponent as "X" | "O"];

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

  // Stanje za koje vazi potvrda klika na "Request draw" / "Accept draw?"
  const drawStateKey = `${gameNumber}-${currentTurn}-${drawOfferBy}`;
  const isConfirmingDraw = drawConfirmKey === drawStateKey;

  // Prvi klik: "Are you sure?", drugi klik: salje ponudu ili prihvata ponudu
  const handleDrawClick = (event: "offer_draw" | "accept_draw") => {
    if (!isConfirmingDraw) {
      setDrawConfirmKey(drawStateKey);
      return;
    }
    socketRef.current?.emit(event);
    setDrawConfirmKey(null);
    setIsCellClicked(false);
  };

  const drawButtonClass =
    "rounded-md bg-amber-500 px-2 py-1 font-semibold text-white cursor-pointer hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed";

  // Dugme za nerijeseno (ili null kad se ne prikazuje). Isti element se
  // prikazuje pored Skip (od sm naviše) i ispod njega (na telefonu).
  const drawButton = gameResult ? null : drawOfferBy === role ? (
    // Ponudio sam - dugme ostaje dok protivnik ne odgovori
    <button
      disabled
      className="rounded-md bg-amber-500 px-2 py-1 font-semibold text-white opacity-70 cursor-default"
    >
      Draw requested
    </button>
  ) : isMyTurn && drawOfferBy === opponent ? (
    <button
      onClick={() => handleDrawClick("accept_draw")}
      disabled={!isConnected}
      className={drawButtonClass}
    >
      {isConfirmingDraw ? "Are you sure?" : "Accept draw?"}
    </button>
  ) : isMyTurn && !drawOfferBy ? (
    <button
      onClick={() => handleDrawClick("offer_draw")}
      disabled={!isConnected}
      className={drawButtonClass}
    >
      {isConfirmingDraw ? "Are you sure?" : "Request draw"}
    </button>
  ) : null;

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
        {/* w-full + px-4 + text-center: sve centrirano i na telefonu */}
        <div className="flex flex-col items-center justify-center w-full max-w-2xl px-4 gap-4 text-center bg-slate-950">
          <div className="flex justify-center items-center gap-2">
            <h3 className="text-xl uppercase text-slate-400">ROOM CODE:</h3>
            <h3 className="text-xl uppercase">{roomID}</h3>
          </div>
          <h1 className="text-2xl sm:text-4xl">Share this link with a friend:</h1>
          {/* Dugi link se lomi unutar dugmeta (break-all) umjesto da izadje van ekrana */}
          <button
            onClick={() => handleCopyLink()}
            className="flex items-center justify-center gap-2 max-w-full cursor-pointer rounded-md p-2 bg-blue-500 hover:bg-blue-600"
          >
            <span className="min-w-0 break-all text-base sm:text-xl">
              Copy link: {currentUrl}
            </span>
            <Copy className="w-5 h-5 shrink-0" />
          </button>

          <div
            className={`fixed top-20 left-1/2 -translate-x-1/2 rounded-md p-3 bg-blue-500 font-semibold text-sm whitespace-nowrap transition-all ease-in duration-300 ${
              copied ? "opacity-100" : "opacity-0"
            }`}
          >
            URL copied to clipboard
          </div>

          <h3 className="text-lg sm:text-xl text-slate-400">
            The game will start when your friend joins
          </h3>
        </div>
        <Footer />
      </div>
    );
  }

  if (!gridData) return null;

  return (
    // overflow-x-hidden: nikad skrol sa strane
    <div className="flex flex-col items-center min-h-dvh overflow-x-hidden bg-slate-950">
      {/* Header */}

      <Header />

      {/* Prostor izmedju headera i footera; grid je sirok do 28rem kao ranije */}
      <main className="flex-1 w-full flex items-center justify-center px-2">
      <div className="flex flex-col w-full max-w-md">

      {/* Iznad grida: rezultat + tajmer lijevo (poravnato sa kolonom kategorija),
          ko je na potezu / skip desno (poravnato sa desnom ivicom grida).
          Ista sirina i pomjeraj kao grid. */}
      {/* Kompaktan red (14px, mali razmaci) na svim ekranima, da pored Skip stane
          i "Request draw". Tekst se nikad ne lomi u novi red (whitespace-nowrap).
          Najsiri slucaj (rezultat + tajmer + Your turn|Skip + "Are you sure?")
          je ~433px od 448px - razmake ne povecavati bez provjere. */}
      <div className="flex items-center justify-between gap-1.5 mb-2 w-full text-sm whitespace-nowrap">
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
              className={`flex items-center border-l-4 bg-slate-700 px-2 py-1 font-normal ${
                role === "X" ? "border-red-500" : "border-blue-500"
              }`}
            >
              YOU
            </span>
            <span className="flex items-center px-2 py-1 font-semibold tabular-nums">
              {score[role as "X" | "O"]} : {score[opponent as "X" | "O"]}
            </span>
            <span
              className={`flex items-center border-r-4 bg-slate-700 px-2 py-1 font-normal ${
                role === "X" ? "border-blue-500" : "border-red-500"
              }`}
            >
              OPP
            </span>
          </div>

          {!gameResult && timeLeftMs != null && (
            <span
              className={`flex items-center rounded-r-md bg-slate-800 px-2 py-1 font-semibold tabular-nums ${
                timeLeftMs <= 5000 ? "text-red-500" : "text-white"
              }`}
            >
              {formatTimeLeft(timeLeftMs)}
            </span>
          )}
        </div>

        {gameResult && matchOver ? (
          // Kraj cijele serije
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
        ) : gameResult ? (
          // Pauza izmedju partija u seriji (vidi se pobjednicka linija)
          <span className="shrink-0 rounded-md bg-slate-600 px-3 sm:px-4 py-1 font-semibold text-white">
            Next game...
          </span>
        ) : (
          // flex-wrap: ako ipak ne stane, dugme za nerijeseno prelazi u novi red
          // umjesto da izadje van ekrana
          <div className="flex flex-wrap items-center justify-end gap-1 min-w-0">
            {/* Tablet i racunar (od 640px): dugme za nerijeseno lijevo od
                "Your turn | Skip". Telefon: ispod (red ispod ovog). */}
            {drawButton && <div className="hidden sm:block">{drawButton}</div>}

            {isMyTurn ? (
              // "Your turn" i "Skip" spojeni u jedan blok
              <div className="flex items-stretch shrink-0 font-semibold text-white">
                <span className="rounded-l-md bg-blue-500 px-2 py-1">
                  Your turn
                </span>
                <button
                  onClick={handleSkip}
                  disabled={!isConnected}
                  className="rounded-r-md bg-red-500 px-2 py-1 cursor-pointer hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Skip
                </button>
              </div>
            ) : (
              <span className="shrink-0 rounded-md bg-slate-600 px-2 py-1 font-semibold text-white">
                Their turn
              </span>
            )}
          </div>
        )}
      </div>

      {/* Na telefonu: ponuda nerijesenog ispod "Your turn / Skip", poravnato desno.
          Stalne visine, da grid ne skace kad se dugme pojavi ili nestane. */}
      <div className="sm:hidden flex justify-end items-start h-10 w-full text-sm whitespace-nowrap">
        {drawButton}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-4 gap-1 w-full">
        <div className="bg-transparent p-1"></div>

        {gridData?.cols.map((col: string, index: number) => (
          <div
            key={index}
            // Mali razmak gore/dole: dugacka imena (3 rijeci) idu u 3 reda, pa bi
            // sa p-4 red bio previsok i pojavio bi se skrol. Tekst stoji uz dno,
            // odmah iznad svoje kolone.
            className="bg-transparent flex items-end justify-center px-1 pt-1 pb-1.5 break-words leading-tight text-l text-center"
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

              // Polje se moze kliknuti: prazno je i igrac je na potezu.
              // Igra ide dalje i dok je protivnik kratko odspojen (vrijeme tece).
              const canGuess =
                !guessedMovie &&
                role === currentTurn &&
                !gameResult &&
                isConnected;

              return (
                <button
                  onClick={() => handleClick(cellId)}
                  key={cellId}
                  disabled={!canGuess}
                  className={`group relative cursor-pointer disabled:cursor-default bg-slate-800 enabled:hover:bg-slate-700 flex items-center justify-center p-4 break-words leading-tight aspect-[2/3] text-l transition-all duration-300 ${
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
                  {/* Plus na praznim poljima kad je igrac na potezu */}
                  {canGuess && (
                    <Plus
                      aria-hidden
                      className="w-8 h-8 sm:w-10 sm:h-10 text-slate-500 transition-colors group-hover:text-white"
                    />
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
      </div>
      </main>

      {/* Poruke o konekciji plutaju iznad footera, da ne pomjeraju raspored */}
      {!isConnected ? (
        <p className="fixed bottom-12 left-1/2 -translate-x-1/2 z-40 rounded-md bg-slate-800 px-3 py-1.5 text-sm text-yellow-400 shadow-lg whitespace-nowrap">
          Connection lost, reconnecting...
        </p>
      ) : (
        !opponentOnline &&
        !gameResult && (
          <p className="fixed bottom-12 left-1/2 -translate-x-1/2 z-40 rounded-md bg-slate-800 px-3 py-1.5 text-sm text-yellow-400 shadow-lg whitespace-nowrap">
            Opponent disconnected. The game ends if they don&apos;t return in
            10s.
          </p>
        )
      )}

      {moveError && (
        <div className="fixed top-20 rounded-md p-3 bg-red-600 font-semibold text-sm">
          {moveError}
        </div>
      )}

      {/* Popup posle svake partije: zelen za pobjedu, crven za poraz, amber za nerijeseno */}
      {gamePopup && (
        <div
          role="status"
          className={`fixed top-20 left-1/2 -translate-x-1/2 z-50 rounded-md px-4 py-1.5 text-sm font-semibold text-white shadow-lg ${
            gamePopup === "DRAW"
              ? "bg-amber-500"
              : gamePopup === role
              ? "bg-green-600"
              : "bg-red-600"
          }`}
        >
          {gamePopup === "DRAW"
            ? "Draw"
            : gamePopup === role
            ? "You won"
            : "You lost"}
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
