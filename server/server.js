const { default: next } = require("next");
const { generateRandomGrid } = require("@/utils/tmdb");

const io = require("socket.io")(4000, {
  cors: {
    origin: ["http://localhost:3000"],
  },
});

const gameStates = {};

io.on("connection", (socket) => {
  console.log(`Korisnik povezan: ${socket.id}`);

  socket.on("join_room", (roomID) => {
    const room = io.sockets.adapter.rooms.get(roomID);
    const numClients = room ? room.size : 0;

    if (numClients >= 2) {
      socket.emit("room_error", "Sorry, room does not exist");
      return;
    }

    socket.join(roomID);

    const role = numClients === 0 ? "X" : "O";

    socket.emit("room_joined", { roomID, role });

    if (numClients === 0) {
      io.to(roomID).emit("waiting", "Waitng for friend to join!");
    }

    if (numClients === 1) {
      const newGrid = generateRandomGrid();

      gameStates[roomID] = {
        turn: "X",
        board: Array(9).fill(null),
        grid: newGrid,
      };

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

      if (!gameState || gameState.turn !== claimedBy) return;

      const nextTurn = claimedBy === "X" ? "O" : "X";
      gameState.turn = nextTurn;

      if (isCorrect) {
        gameState.board[cellIndex] = {
          poster_path: movie.poster_path,
          title: movie.title,
          claimedBy: claimedBy,
        };

        io.to(roomID).emit("receive_move", {
          cellIndex,
          isCorrect,
          movie,
          claimedBy,
        });
      }
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
