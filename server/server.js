const http = require("http");
const { Server } = require("socket.io");
const { generateRandomGrid } = require("@/utils/tmdb");

const PORT = process.env.PORT || 4000;
const TMDB_KEY = process.env.TMDB_KEY;
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

// Koliko glumaca sa vrha cast liste se racuna (isto kao u scripts/fetch-top-rated-movies.ts)
const TOP_ACTORS_COUNT = 4;

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

io.on("connection", (socket) => {
  console.log(`Korisnik povezan: ${socket.id}`);

  socket.on("join_room", (roomID) => {
    if (typeof roomID !== "string" || !roomID) {
      socket.emit("room_error", "Invalid room");
      return;
    }

    if (!gameStates[roomID]) {
      gameStates[roomID] = {
        turn: "X",
        board: Array(9).fill(null),
        grid: generateRandomGrid(),
        players: {}, // socket.id -> "X" | "O"
        result: null,
        pendingMove: false,
      };
    }

    const gameState = gameStates[roomID];

    // Isti socket je vec u sobi (npr. dupli emit) - samo mu ponovo javi ulogu
    if (gameState.players[socket.id]) {
      socket.emit("room_joined", { roomID, role: gameState.players[socket.id] });
      return;
    }

    const takenRoles = Object.values(gameState.players);

    if (takenRoles.length >= 2) {
      socket.emit("room_error", "Sorry, room is full");
      return;
    }

    const role = takenRoles.includes("X") ? "O" : "X";
    gameState.players[socket.id] = role;

    socket.join(roomID);
    socket.emit("room_joined", { roomID, role });

    if (takenRoles.length === 0) {
      io.to(roomID).emit("waiting", "Waiting for friend to join!");
    } else {
      io.to(roomID).emit("game_start", {
        currentTurn: gameState.turn,
        grid: gameState.grid,
      });
    }
  });

  socket.on("make_move", async ({ roomID, cellIndex, movieId } = {}) => {
    const reject = (reason) => {
      console.log(`Potez odbijen (${socket.id}): ${reason}`);
      socket.emit("move_rejected", { reason });
    };

    const gameState = gameStates[roomID];

    if (!gameState) return reject("Game does not exist");

    const role = gameState.players[socket.id];

    if (!role) return reject("You are not a player in this room");
    if (Object.keys(gameState.players).length < 2)
      return reject("Waiting for opponent");
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

    // Soba je mogla biti obrisana (ili resetovana) dok smo cekali TMDB
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

  socket.on("disconnecting", () => {
    socket.rooms.forEach((roomId) => {
      if (roomId === socket.id) return;

      const gameState = gameStates[roomId];
      if (gameState) delete gameState.players[socket.id];

      socket.to(roomId).emit("player_left", "Opponent left the game!");

      const room = io.sockets.adapter.rooms.get(roomId);

      if (!room || room.size <= 1) {
        delete gameStates[roomId];
      }
    });
  });

  socket.on("disconnect", () => {
    console.log(`Korisnik odspojen: ${socket.id}`);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server pokrenut i sluša na portu ${PORT}`);
});
