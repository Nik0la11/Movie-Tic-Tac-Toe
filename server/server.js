const http = require("http");
const { Server } = require("socket.io");
const { generateRandomGrid } = require("@/utils/tmdb");

const PORT = process.env.PORT || 4000;

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

io.on("connection", (socket) => {
  console.log(`Korisnik povezan: ${socket.id}`);

  socket.on("join_room", (roomID) => {
    const room = io.sockets.adapter.rooms.get(roomID);
    const numClients = room ? room.size : 0;
    /*
    if (!room || numClients >= 2) {
      socket.emit("room_error", "Sorry, room does not exist");
      return;
    }
    */

    socket.join(roomID);

    const role = numClients === 0 ? "X" : "O";

    const newGrid = generateRandomGrid();

    if (!gameStates[roomID]) {
      gameStates[roomID] = {
        turn: "X",
        board: Array(9).fill(null),
        grid: newGrid,
      };
    }

    socket.emit("room_joined", { roomID, role });

    if (numClients === 0) {
      io.to(roomID).emit("waiting", "Waitng for friend to join!");
    }

    if (numClients === 1) {
      io.to(roomID).emit("game_start", {
        currentTurn: "X",
        grid: gameStates[roomID].grid,
      });
    }
  });

  socket.on(
    "make_move",
    ({ roomID, cellIndex, isCorrect, movie, claimedBy }) => {
      const gameState = gameStates[roomID];

      if (!gameState || gameState.turn !== claimedBy) {
        console.log(`Potez odbijen, nije red na ${claimedBy}`);
        return;
      }

      const nextTurn = claimedBy === "X" ? "O" : "X";
      gameState.turn = nextTurn;

      if (isCorrect) {
        gameState.board[cellIndex] = {
          poster_path: movie.poster_path,
          title: movie.title,
          claimedBy: claimedBy,
        };
      }

      const result = checkWinner(gameState.board);

      if (result) {
        io.to(roomID).emit("game_end", result);
      }

      io.to(roomID).emit("receive_move", {
        cellIndex,
        isCorrect,
        movie: isCorrect ? movie : null,
        claimedBy: isCorrect ? claimedBy : null,
        nextTurn,
      });
    }
  );

  socket.on("disconnecting", () => {
    socket.rooms.forEach((roomId) => {
      if (roomId !== socket.id) {
        socket.to(roomId).emit("player_left", "Opponent left the game!");

        const room = io.sockets.adapter.rooms.get(roomId);

        if (!room || room.size <= 1) {
          delete gameStates[roomId];
        }
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
