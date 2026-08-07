const io = require("socket.io")(4000, {
  cors: {
    origin: ["http://localhost:3000"],
  },
});

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
      io.to(roomID).emit("game_start", "All players are ready!");
    }
  });

  socket.on("disconnecting", () => {
    socket.rooms.forEach((roomId) => {
      if (roomId !== socket.id) {
        socket.to(roomId).emit("player_left", "Opponent left the game!");
      }
    });

    socket.on("disconnect", () => {
      console.log(`Korisnik odspojen: ${socket.id}`);
    });
  });
});
