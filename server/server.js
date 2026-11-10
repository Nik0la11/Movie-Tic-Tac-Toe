const http = require("http");
const { Server } = require("socket.io");
const { generateRandomGrid } = require("@/utils/tmdb");

const PORT = process.env.PORT || 4000;
const TMDB_KEY = process.env.TMDB_KEY;
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

// Koliko glumaca sa vrha cast liste se racuna (isto kao u scripts/fetch-top-rated-movies.ts)
const TOP_ACTORS_COUNT = 4;

// Koliko dugo soba ostaje u memoriji kad su svi igraci odspojeni
// (da bi refresh ili kratak prekid mreze mogli da nastave istu igru)
const ROOM_CLEANUP_MS = 2 * 60 * 1000;

// Nazivi zanrova u gridu -> TMDB genre ID
const GENRE_IDS = {
  Action: 28,
  Adventure: 12,
  Animation: 16,
  Comedy: 35,
  Crime: 80,
  Documentary: 99,
  Drama: 18,
  Family: 10751,
  Fantasy: 14,
  History: 36,
  Horror: 27,
  Music: 10402,
  Mystery: 9648,
  Romance: 10749,
  "Sci-Fi": 878,
  "TV Movie": 10770,
  Thriller: 53,
  War: 10752,
  Western: 37,
};

const server = http.createServer();

const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

const gameStates = {};

const WINNING_COMBINATIONS = [
  // kolone
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],

  // redovi
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],

  // dijagonale
  [0, 4, 8],
  [2, 4, 6],
];

const checkWinner = (board) => {
  for (const combination of WINNING_COMBINATIONS) {
    const [a, b, c] = combination;

    if (
      board[a]?.claimedBy &&
      board[a].claimedBy === board[b]?.claimedBy &&
      board[b].claimedBy === board[c]?.claimedBy
    ) {
      return { winner: board[a]?.claimedBy, winningLine: combination };
    }
  }

  const isDraw = board.every((cell) => cell && cell.claimedBy);

  if (isDraw) {
    return { winner: "DRAW", winningLine: [] };
  }

  return null;
};

const fetchMovie = async (movieId) => {
  const res = await fetch(
    `${TMDB_BASE_URL}/movie/${movieId}?api_key=${TMDB_KEY}&append_to_response=credits`
  );

  if (!res.ok) {
    throw new Error(`TMDB vratio status ${res.status} za film ${movieId}`);
  }

  const data = await res.json();

  const releaseYear = parseInt((data.release_date || "").split("-")[0]);

  return {
    id: data.id,
    title: data.title,
    poster_path: data.poster_path,
    decade: Number.isNaN(releaseYear)
      ? null
      : `${Math.floor(releaseYear / 10) * 10}s`,
    genreIds: (data.genres || []).map((genre) => genre.id),
    directors: (data.credits?.crew || [])
      .filter((member) => member.job === "Director")
      .map((member) => member.name),
    actors: (data.credits?.cast || [])
      .slice(0, TOP_ACTORS_COUNT)
      .map((actor) => actor.name),
  };
};

// criterion je u formatu "tip:vrijednost", npr. "genre:Sci-Fi", "actor:Brad Pitt"
const matchesCriterion = (movie, criterion) => {
  const separatorIndex = criterion.indexOf(":");
  const type = criterion.slice(0, separatorIndex);
  const value = criterion.slice(separatorIndex + 1);

  switch (type) {
    case "genre":
      return movie.genreIds.includes(GENRE_IDS[value]);
    case "decade":
      return movie.decade === value;
    case "actor":
      return movie.actors.includes(value);
    case "director":
      return movie.directors.includes(value);
    default:
      return false;
  }
};

const createGameState = () => ({
  turn: "X",
  board: Array(9).fill(null),
  grid: generateRandomGrid(),
  // Mjesta u igri. Igrac se prepoznaje po playerId (stalan po tabu),
  // a ne po socket.id koji se mijenja pri svakom ponovnom povezivanju.
  seats: { X: null, O: null }, // { playerId, socketId, connected }
  result: null,
  pendingMove: false,
  moveCount: 0,
  cleanupTimer: null,
});

const playersStatus = (gameState) => ({
  X: !!gameState.seats.X?.connected,
  O: !!gameState.seats.O?.connected,
});

const scheduleCleanupIfEmpty = (roomID) => {
  const gameState = gameStates[roomID];
  if (!gameState) return;

  const anyoneConnected = Object.values(gameState.seats).some(
    (seat) => seat?.connected
  );
  if (anyoneConnected) return;

  clearTimeout(gameState.cleanupTimer);
  gameState.cleanupTimer = setTimeout(() => {
    if (gameStates[roomID] === gameState) {
      delete gameStates[roomID];
      console.log(`Soba ${roomID} obrisana`);
    }
  }, ROOM_CLEANUP_MS);
};

// Vraca sobu i ulogu igraca za ovaj socket, ili null ako socket nije igrac
const getPlayer = (socket) => {
  const { roomID, role } = socket.data;
  const gameState = roomID && gameStates[roomID];

  if (!gameState || !role || gameState.seats[role]?.socketId !== socket.id) {
    return null;
  }

  return { roomID, gameState, role };
};

const leaveSeat = (socket) => {
  const player = getPlayer(socket);
  socket.data.roomID = null;
  socket.data.role = null;
  if (!player) return;

  const { roomID, gameState, role } = player;
  gameState.seats[role].connected = false;
  socket.leave(roomID);

  io.to(roomID).emit("players_status", playersStatus(gameState));
  scheduleCleanupIfEmpty(roomID);
};

io.on("connection", (socket) => {
  console.log(`Korisnik povezan: ${socket.id}`);

  socket.on("join_room", ({ roomID, playerId } = {}) => {
    if (
      typeof roomID !== "string" ||
      !roomID ||
      roomID.length > 64 ||
      typeof playerId !== "string" ||
      !playerId ||
      playerId.length > 64
    ) {
      socket.emit("room_error", "Invalid room link");
      return;
    }

    // Socket moze biti samo u jednoj sobi
    if (socket.data.roomID && socket.data.roomID !== roomID) {
      leaveSeat(socket);
    }

    if (!gameStates[roomID]) {
      gameStates[roomID] = createGameState();
    }

    const gameState = gameStates[roomID];
    const { seats } = gameState;

    // 1) Igrac se vraca (refresh, novi socket poslije prekida mreze)
    let role = ["X", "O"].find((r) => seats[r]?.playerId === playerId);

    // 2) Novi igrac na slobodno mjesto
    if (!role) role = ["X", "O"].find((r) => !seats[r]);

    // 3) Novi igrac preuzima mjesto igraca koji je odspojen
    //    (npr. prijatelj prvo otvori link u Messenger browseru pa u Chrome-u)
    if (!role) role = ["X", "O"].find((r) => !seats[r].connected);

    // 4) Dok niko nije odigrao potez, novi gost zamjenjuje gosta (O).
    //    Ako je mjesto zauzeo program koji je sam otvorio link (preview u
    //    chat aplikaciji), pravi igrac ga izbaci. Kreator (X) se nikad ne mijenja.
    if (!role && gameState.moveCount === 0) role = "O";

    if (!role) {
      socket.emit("room_error", "This room is full");
      scheduleCleanupIfEmpty(roomID);
      return;
    }

    // Prethodna konekcija na ovom mjestu gubi mjesto
    // (isti igrac u drugom tabu, ili zamijenjeni gost iz koraka 4)
    const previous = seats[role];
    if (previous?.connected && previous.socketId !== socket.id) {
      const oldSocket = io.sockets.sockets.get(previous.socketId);
      if (oldSocket) {
        oldSocket.data.roomID = null;
        oldSocket.data.role = null;
        oldSocket.leave(roomID);
        oldSocket.emit(
          "room_error",
          previous.playerId === playerId
            ? "This game was opened in another tab"
            : "Another player joined this room"
        );
      }
    }

    clearTimeout(gameState.cleanupTimer);
    gameState.cleanupTimer = null;

    seats[role] = { playerId, socketId: socket.id, connected: true };
    console.log(
      `Soba ${roomID}: ${role} = ${playerId} (${
        socket.handshake.headers["user-agent"] || "nepoznat user-agent"
      })`
    );
    socket.data.roomID = roomID;
    socket.data.role = role;
    socket.join(roomID);

    socket.emit("room_joined", { roomID, role });

    // Igra pocinje tek kad su oba mjesta popunjena
    if (!seats.X || !seats.O) {
      socket.emit("waiting", "Waiting for friend to join!");
      return;
    }

    // Saljemo cijelo stanje, da bi i igrac koji se vratio vidio tablu
    io.to(roomID).emit("game_start", {
      currentTurn: gameState.turn,
      grid: gameState.grid,
      board: gameState.board,
      result: gameState.result,
      players: playersStatus(gameState),
    });
  });

  socket.on("make_move", async ({ cellIndex, movieId } = {}) => {
    const reject = (reason) => {
      console.log(`Potez odbijen (${socket.id}): ${reason}`);
      socket.emit("move_rejected", { reason });
    };

    const player = getPlayer(socket);

    if (!player) return reject("You are not a player in this room");

    const { roomID, gameState, role } = player;
    const status = playersStatus(gameState);

    if (!gameState.seats.X || !gameState.seats.O)
      return reject("Waiting for opponent");
    if (!status.X || !status.O) return reject("Opponent is disconnected");
    if (gameState.result) return reject("Game is over");
    if (gameState.turn !== role) return reject("Not your turn");
    if (gameState.pendingMove) return reject("Move already in progress");
    if (!Number.isInteger(cellIndex) || cellIndex < 0 || cellIndex > 8)
      return reject("Invalid cell");
    if (gameState.board[cellIndex]) return reject("Cell is already taken");
    if (!Number.isInteger(movieId) || movieId <= 0)
      return reject("Invalid movie");

    // Zakljucaj potez dok cekamo TMDB, da isti igrac ne posalje dva poteza
    gameState.pendingMove = true;

    let movie;
    try {
      movie = await fetchMovie(movieId);
    } catch (err) {
      console.error("Greska pri provjeri filma", err);
      gameState.pendingMove = false;
      return reject("Could not verify movie, try again");
    }

    // Soba je mogla biti obrisana dok smo cekali TMDB
    if (gameStates[roomID] !== gameState) return;
    gameState.pendingMove = false;

    const row = gameState.grid.rows[Math.floor(cellIndex / 3)];
    const col = gameState.grid.cols[cellIndex % 3];

    const isCorrect =
      matchesCriterion(movie, row) && matchesCriterion(movie, col);

    if (isCorrect) {
      gameState.board[cellIndex] = {
        poster_path: movie.poster_path,
        title: movie.title,
        claimedBy: role,
      };
    }

    const nextTurn = role === "X" ? "O" : "X";
    gameState.turn = nextTurn;
    gameState.moveCount++;

    io.to(roomID).emit("receive_move", {
      cellIndex,
      isCorrect,
      movie: isCorrect
        ? { poster_path: movie.poster_path, title: movie.title }
        : null,
      claimedBy: isCorrect ? role : null,
      nextTurn,
    });

    const result = checkWinner(gameState.board);

    if (result) {
      gameState.result = result;
      io.to(roomID).emit("game_end", result);
    }
  });

  socket.on("disconnect", () => {
    console.log(`Korisnik odspojen: ${socket.id}`);
    leaveSeat(socket);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server pokrenut i sluša na portu ${PORT}`);
});
