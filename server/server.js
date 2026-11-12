const http = require("http");
const { Server } = require("socket.io");
const { generateRandomGrid } = require("@/utils/tmdb");

const PORT = process.env.PORT || 4000;
const TMDB_KEY = process.env.TMDB_KEY;
const TMDB_BASE_URL = "https://api.themoviedb.org/3";

// Koliko dugo soba ostaje u memoriji kad su svi igraci odspojeni
// (da bi refresh ili kratak prekid mreze mogli da nastave istu igru)
const ROOM_CLEANUP_MS = 2 * 60 * 1000;

// Vrijeme za potez koje kreator bira (null = bez ogranicenja)
const ALLOWED_TURN_SECONDS = [15, 40, 60, null];
const DEFAULT_TURN_SECONDS = 40;

// Broj partija u seriji koje kreator bira (null = bez kraja)
const ALLOWED_BEST_OF = [3, 5, 7, null];
const DEFAULT_BEST_OF = 5;

// Pauza izmedju partija, da igraci vide pobjednicku liniju prije nove table
const NEXT_GAME_DELAY_MS = 1000;

// Ako igrac izadje usred igre i ne vrati se za ovoliko vremena, igra se brise
// i protivnik dobija poruku da je igrac napustio igru
const ABANDON_MS = 10 * 1000;

// Koliko dugo pamtimo da je igra u sobi zavrsena (napustena), da link vodi na
// poruku "This game has ended" umjesto u novu praznu sobu
const ENDED_ROOM_MEMORY_MS = 5 * 60 * 1000;

// Koliko najduze cekamo TMDB pri provjeri filma
const TMDB_TIMEOUT_MS = 8000;

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
    `${TMDB_BASE_URL}/movie/${movieId}?api_key=${TMDB_KEY}&append_to_response=credits`,
    { signal: AbortSignal.timeout(TMDB_TIMEOUT_MS) }
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
    // Cijeli spisak glumaca, ne samo prvih par: priznaju se i manje uloge
    actors: (data.credits?.cast || []).map((actor) => actor.name),
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

// Uzima vrijednost iz podesavanja kreatora ako je dozvoljena, inace podrazumijevanu
const parseSetting = (settings, key, allowed, fallback) => {
  if (settings && typeof settings === "object" && key in settings) {
    const value = settings[key];
    if (allowed.includes(value)) return value;
  }
  return fallback;
};

const createGameState = (settings) => ({
  turn: "X",
  turnSeconds: parseSetting(
    settings,
    "turnSeconds",
    ALLOWED_TURN_SECONDS,
    DEFAULT_TURN_SECONDS
  ),
  // Serija partija
  bestOf: parseSetting(settings, "bestOf", ALLOWED_BEST_OF, DEFAULT_BEST_OF),
  score: { X: 0, O: 0 },
  gameNumber: 1,
  matchWinner: null, // "X" | "O" kad je serija gotova
  nextGameTimer: null, // pauza izmedju partija
  drawOfferBy: null, // "X" | "O" - ko je ponudio nerijeseno u ovoj partiji
  // Ko igra prvi u 1. partiji serije (dalje naizmjenicno). Poslije rematch-a
  // pocinje onaj ko je u posljednjoj partiji igrao drugi.
  firstTurn: "X",
  // "X" | "O" - ko je trazio rematch poslije kraja serije
  rematchRequestBy: null,
  // Tajmer poteza. Nikad ne staje (ni kad se neko odspoji). Stanja: radi
  // (turnTimer + turnDeadline), isteklo dok se film provjerava (turnExpired),
  // ili ugasen (bez ogranicenja / kraj igre).
  turnTimer: null,
  turnDeadline: null,
  turnExpired: false,
  board: Array(9).fill(null),
  grid: generateRandomGrid(),
  // Mjesta u igri. Igrac se prepoznaje po playerId (stalan po tabu),
  // a ne po socket.id koji se mijenja pri svakom ponovnom povezivanju.
  seats: { X: null, O: null }, // { playerId, socketId, connected }
  result: null,
  pendingMove: false,
  moveCount: 0,
  cleanupTimer: null,
  // Odbrojavanje od ABANDON_MS za igraca koji je izasao usred igre
  abandonTimers: { X: null, O: null },
});

const playersStatus = (gameState) => ({
  X: !!gameState.seats.X?.connected,
  O: !!gameState.seats.O?.connected,
});

// ---------- Tajmer poteza ----------

// Stanje tajmera koje saljemo klijentima. Saljemo preostalo vrijeme, a ne
// apsolutno vrijeme, jer satovi na serveru i telefonu nisu uskladjeni.
const timerSnapshot = (gameState) => {
  let timeLeftMs = null;
  if (gameState.turnTimer) {
    timeLeftMs = Math.max(0, gameState.turnDeadline - Date.now());
  } else if (gameState.turnExpired) {
    timeLeftMs = 0;
  }

  return {
    turn: gameState.turn,
    turnSeconds: gameState.turnSeconds,
    timeLeftMs,
  };
};

const stopTurnTimer = (gameState) => {
  clearTimeout(gameState.turnTimer);
  gameState.turnTimer = null;
  gameState.turnDeadline = null;
  gameState.turnExpired = false;
};

const runTurnTimer = (roomID, gameState, ms) => {
  clearTimeout(gameState.turnTimer);
  gameState.turnExpired = false;
  gameState.turnDeadline = Date.now() + ms;
  gameState.turnTimer = setTimeout(() => onTurnTimeout(roomID, gameState), ms);
};

// Puno vrijeme za igraca koji je upravo dobio potez
const startTurnTimer = (roomID, gameState) => {
  stopTurnTimer(gameState);
  if (gameState.turnSeconds == null || gameState.result) return;

  runTurnTimer(roomID, gameState, gameState.turnSeconds * 1000);
};

// ---------- Ponuda nerijesenog ----------

const setDrawOffer = (roomID, gameState, by) => {
  if (gameState.drawOfferBy === by) return;
  gameState.drawOfferBy = by;
  io.to(roomID).emit("draw_offer", { by });
};

// Ponuda vazi samo dok je protivnik na potezu. Kad red opet dodje do onoga
// ko je ponudio (protivnik odigrao, skipovao ili mu isteklo vrijeme), ponuda propada.
const expireDrawOfferIfTurnReturned = (roomID, gameState) => {
  if (gameState.drawOfferBy && gameState.drawOfferBy === gameState.turn) {
    setDrawOffer(roomID, gameState, null);
  }
};

const passTurn = (roomID, gameState, reason) => {
  gameState.turn = gameState.turn === "X" ? "O" : "X";
  expireDrawOfferIfTurnReturned(roomID, gameState);
  startTurnTimer(roomID, gameState);
  io.to(roomID).emit("turn_timer", { ...timerSnapshot(gameState), reason });
};

const onTurnTimeout = (roomID, gameState) => {
  gameState.turnTimer = null;
  if (gameStates[roomID] !== gameState || gameState.result) return;

  // Film je poslat na vrijeme i jos se provjerava - potez ce sam predati red
  if (gameState.pendingMove) {
    gameState.turnExpired = true;
    return;
  }

  passTurn(roomID, gameState, "timeout");
};

// ---------- Serija partija ----------

// Cijelo stanje igre. Salje se na pocetku, pri povratku igraca i za svaku novu partiju.
const emitGameState = (roomID, gameState) => {
  io.to(roomID).emit("game_start", {
    currentTurn: gameState.turn,
    grid: gameState.grid,
    board: gameState.board,
    result: gameState.result,
    players: playersStatus(gameState),
    timer: timerSnapshot(gameState),
    score: gameState.score,
    bestOf: gameState.bestOf,
    gameNumber: gameState.gameNumber,
    matchWinner: gameState.matchWinner,
    drawOfferBy: gameState.drawOfferBy,
    rematchRequestBy: gameState.rematchRequestBy,
  });
};

const otherRole = (role) => (role === "X" ? "O" : "X");

// Ko igra prvi u partiji broj gameNumber: naizmjenicno, pocevsi od firstTurn
const starterOfGame = (gameState, gameNumber) =>
  gameNumber % 2 === 1 ? gameState.firstTurn : otherRole(gameState.firstTurn);

const startNextGame = (roomID, gameState) => {
  gameState.nextGameTimer = null;
  // Soba je mogla biti obrisana tokom pauze
  if (gameStates[roomID] !== gameState) return;

  gameState.gameNumber++;
  gameState.board = Array(9).fill(null);
  gameState.grid = generateRandomGrid();
  gameState.result = null;
  gameState.drawOfferBy = null;
  // Prvi potez naizmjenicno (1. partija firstTurn, 2. drugi igrac, 3. firstTurn...)
  gameState.turn = starterOfGame(gameState, gameState.gameNumber);

  startTurnTimer(roomID, gameState);
  emitGameState(roomID, gameState);
};

// Oba igraca su prihvatila rematch: potpuno nova serija u istoj sobi.
// Brise se sve od prosle serije (rezultat, tabla, ponude), ostaju samo
// igraci na svojim mjestima i podesavanja (vrijeme, best of).
const startRematch = (roomID, gameState) => {
  const lastStarter = starterOfGame(gameState, gameState.gameNumber);

  clearTimeout(gameState.nextGameTimer);
  gameState.nextGameTimer = null;
  stopTurnTimer(gameState);

  gameState.firstTurn = otherRole(lastStarter);
  gameState.turn = gameState.firstTurn;
  gameState.score = { X: 0, O: 0 };
  gameState.gameNumber = 1;
  gameState.matchWinner = null;
  gameState.board = Array(9).fill(null);
  gameState.grid = generateRandomGrid();
  gameState.result = null;
  gameState.drawOfferBy = null;
  gameState.rematchRequestBy = null;
  gameState.pendingMove = false;
  // moveCount se namjerno NE vraca na 0: pravila "prije prvog poteza"
  // (zamjena gosta, oslobadjanje mjesta) vaze samo za pocetak prve igre u sobi.

  startTurnTimer(roomID, gameState);
  emitGameState(roomID, gameState);
  console.log(`Soba ${roomID}: rematch, prvi igra ${gameState.firstTurn}`);
};

// Partija je gotova: azuriraj rezultat, pa ili zavrsi seriju ili odmah pokreni novu partiju
const endGame = (roomID, gameState, result) => {
  stopTurnTimer(gameState);

  if (result.winner !== "DRAW") gameState.score[result.winner]++;

  const winsNeeded =
    gameState.bestOf == null ? null : Math.ceil(gameState.bestOf / 2);
  const matchWinner =
    winsNeeded != null &&
    result.winner !== "DRAW" &&
    gameState.score[result.winner] >= winsNeeded
      ? result.winner
      : null;

  io.to(roomID).emit("game_end", {
    ...result,
    score: gameState.score,
    matchWinner,
  });

  // Tabla ostaje (sa pobjednickom linijom), potezi su zakljucani
  gameState.result = result;

  if (matchWinner) {
    // Kraj serije: tabla ostaje zauvijek
    gameState.matchWinner = matchWinner;
    return;
  }

  // Kratka pauza da se vidi pobjednicka linija, pa nova partija
  gameState.nextGameTimer = setTimeout(
    () => startNextGame(roomID, gameState),
    NEXT_GAME_DELAY_MS
  );
};

// ---------- Brisanje sobe ----------

// Sobe cija je igra zavrsena napustanjem: roomID -> true (pamti se ENDED_ROOM_MEMORY_MS)
const endedRooms = new Map();

const clearRoomTimers = (gameState) => {
  stopTurnTimer(gameState);
  clearTimeout(gameState.nextGameTimer);
  clearTimeout(gameState.cleanupTimer);
  clearTimeout(gameState.abandonTimers.X);
  clearTimeout(gameState.abandonTimers.O);
};

// Obrisi sobu i javi igracima koji su jos u njoj. Link poslije vodi na
// "This game has ended".
//  - usred serije: "opponent_left" (poruka na ekranu)
//  - poslije kraja serije (izlazak ili odbijen rematch): "match_closed"
//    (igraci se vracaju na pocetnu stranicu)
const endAbandonedRoom = (roomID, gameState) => {
  if (gameStates[roomID] !== gameState) return;

  clearRoomTimers(gameState);
  delete gameStates[roomID];

  endedRooms.set(roomID, true);
  setTimeout(() => endedRooms.delete(roomID), ENDED_ROOM_MEMORY_MS);

  const socketIds = io.sockets.adapter.rooms.get(roomID) || new Set();
  for (const id of [...socketIds]) {
    const s = io.sockets.sockets.get(id);
    if (!s) continue;
    s.data.roomID = null;
    s.data.role = null;
    s.leave(roomID);
    if (gameState.matchWinner) {
      s.emit("match_closed");
    } else {
      s.emit("opponent_left", "Your opponent left the game");
    }
  }

  console.log(
    `Soba ${roomID} obrisana (igrac napustio igru ili odbio rematch)`
  );
};

// Igrac je izasao usred igre: ima ABANDON_MS da se vrati, inace se igra brise
const startAbandonTimer = (roomID, gameState, role) => {
  clearTimeout(gameState.abandonTimers[role]);
  gameState.abandonTimers[role] = setTimeout(() => {
    gameState.abandonTimers[role] = null;
    if (gameStates[roomID] !== gameState) return;
    if (gameState.seats[role]?.connected) return; // vratio se u medjuvremenu

    // Gost nije odigrao nijedan potez (igra prakticno nije pocela, ili je to
    // bio program koji pravi pregled linka): samo oslobodi mjesto, a kreator
    // se vraca na stranicu sa linkom i ceka prijatelja
    if (role === "O" && gameState.moveCount === 0) {
      gameState.seats.O = null;
      stopTurnTimer(gameState);
      io.to(roomID).emit("waiting", "Waiting for friend to join!");
      scheduleCleanupIfEmpty(roomID);
      return;
    }

    endAbandonedRoom(roomID, gameState);
  }, ABANDON_MS);
};

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
      clearRoomTimers(gameState);
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
  const { seats } = gameState;
  seats[role].connected = false;
  socket.leave(roomID);

  // Igra jos nije pocela (kreator sam ceka prijatelja)
  if (!seats.X || !seats.O) {
    scheduleCleanupIfEmpty(roomID);
    return;
  }

  io.to(roomID).emit("players_status", playersStatus(gameState));

  // Ima ABANDON_MS da se vrati (protivnik za to vrijeme vidi poruku).
  // Vrijeme za potez i dalje tece. Ako je serija vec gotova, a on se ne vrati,
  // protivnik se vraca na pocetnu stranicu (vidi endAbandonedRoom).
  startAbandonTimer(roomID, gameState, role);
};

io.on("connection", (socket) => {
  console.log(`Korisnik povezan: ${socket.id}`);

  socket.on("join_room", ({ roomID, playerId, settings } = {}) => {
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

    // Igra u ovoj sobi je zavrsena jer ju je neko napustio
    if (endedRooms.has(roomID) && !gameStates[roomID]) {
      socket.emit("room_error", "This game has ended");
      return;
    }

    // Socket moze biti samo u jednoj sobi
    if (socket.data.roomID && socket.data.roomID !== roomID) {
      leaveSeat(socket);
    }

    // Sobu pravi prvi igrac (kreator), pa se uzimaju njegova podesavanja
    if (!gameStates[roomID]) {
      gameStates[roomID] = createGameState(settings);
    }

    const gameState = gameStates[roomID];
    const { seats } = gameState;

    // 1) Igrac se vraca (refresh, novi socket poslije prekida mreze)
    let role = ["X", "O"].find((r) => seats[r]?.playerId === playerId);

    // 2) Novi igrac na slobodno mjesto
    if (!role) role = ["X", "O"].find((r) => !seats[r]);

    // Mjesto igraca koji je izasao je rezervisano samo za njega (isti playerId),
    // pa niko drugi ne moze da udje i igra umjesto njega.

    // 3) Dok niko nije odigrao potez, novi gost zamjenjuje gosta (O).
    //    Ako je mjesto zauzeo program koji je sam otvorio link (preview u
    //    chat aplikaciji), pravi igrac ga izbaci. Kreator (X) se nikad ne mijenja.
    //    Samo dok je kreator tu: ako je kreator izasao, njegovo mjesto ceka njega,
    //    a niko novi ne smije da izbaci gosta.
    if (!role && gameState.moveCount === 0 && seats.X?.connected) role = "O";

    if (!role) {
      socket.emit("room_error", "This room is full");
      scheduleCleanupIfEmpty(roomID);
      return;
    }

    // Prethodna konekcija na ovom mjestu gubi mjesto
    // (isti igrac u drugom tabu, ili zamijenjeni gost iz koraka 3)
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
    // Vratio se na vrijeme - igra se ne brise
    clearTimeout(gameState.abandonTimers[role]);
    gameState.abandonTimers[role] = null;

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

    // Pocetak igre ili zamjena gosta prije prvog poteza: X dobija puno vrijeme.
    // Igrac koji se vratio (refresh, prekid) zatice vrijeme koje je i dalje teklo.
    const isNewOccupant = previous?.playerId !== playerId;
    if (gameState.moveCount === 0 && isNewOccupant) {
      startTurnTimer(roomID, gameState);
    }

    // Saljemo cijelo stanje, da bi i igrac koji se vratio vidio tablu
    emitGameState(roomID, gameState);
  });

  socket.on("make_move", async ({ cellIndex, movieId } = {}) => {
    const reject = (reason) => {
      console.log(`Potez odbijen (${socket.id}): ${reason}`);
      socket.emit("move_rejected", { reason });
    };

    const player = getPlayer(socket);

    if (!player) return reject("You are not a player in this room");

    const { roomID, gameState, role } = player;

    if (!gameState.seats.X || !gameState.seats.O)
      return reject("Waiting for opponent");
    if (gameState.result) return reject("Game is over");
    if (gameState.turn !== role) return reject("Not your turn");
    if (gameState.pendingMove) return reject("Move already in progress");
    if (gameState.turnExpired) return reject("Time is up");
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
      reject("Could not verify movie, try again");

      // Ako je vrijeme isteklo dok smo cekali TMDB, red prelazi na protivnika
      if (gameStates[roomID] === gameState && gameState.turnExpired) {
        passTurn(roomID, gameState, "timeout");
      }
      return;
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
    expireDrawOfferIfTurnReturned(roomID, gameState);

    const result = checkWinner(gameState.board);

    // Novi igrac dobija puno vrijeme; ako je partija gotova, tajmer se gasi
    if (result) {
      stopTurnTimer(gameState);
    } else {
      startTurnTimer(roomID, gameState);
    }

    io.to(roomID).emit("receive_move", {
      cellIndex,
      isCorrect,
      movie: isCorrect
        ? { poster_path: movie.poster_path, title: movie.title }
        : null,
      claimedBy: isCorrect ? role : null,
      nextTurn,
      timer: timerSnapshot(gameState),
    });

    if (result) endGame(roomID, gameState, result);
  });

  // Zajednicke provjere za skip, ponudu i prihvatanje nerijesenog:
  // igrac je u sobi, partija traje i on je na potezu
  const getPlayerOnTurn = (reject) => {
    const player = getPlayer(socket);
    if (!player) return reject("You are not a player in this room");

    const { gameState, role } = player;

    if (!gameState.seats.X || !gameState.seats.O)
      return reject("Waiting for opponent");
    if (gameState.result) return reject("Game is over");
    if (gameState.turn !== role) return reject("Not your turn");
    if (gameState.pendingMove) return reject("Move already in progress");

    return player;
  };

  socket.on("skip_turn", () => {
    const reject = (reason) => {
      socket.emit("move_rejected", { reason });
      return null;
    };

    const player = getPlayerOnTurn(reject);
    if (!player) return;

    player.gameState.moveCount++;
    passTurn(player.roomID, player.gameState, "skip");
  });

  // Ponuda nerijesenog: vazi kao potez, red prelazi na protivnika
  socket.on("offer_draw", () => {
    const reject = (reason) => {
      socket.emit("move_rejected", { reason });
      return null;
    };

    const player = getPlayerOnTurn(reject);
    if (!player) return;

    const { roomID, gameState, role } = player;
    if (gameState.drawOfferBy) return reject("Draw already offered");

    gameState.moveCount++;
    setDrawOffer(roomID, gameState, role);
    passTurn(roomID, gameState, "draw_offer");
  });

  // Prihvatanje nerijesenog: partija se zavrsava kao nerijesena i krece nova
  socket.on("accept_draw", () => {
    const reject = (reason) => {
      socket.emit("move_rejected", { reason });
      return null;
    };

    const player = getPlayerOnTurn(reject);
    if (!player) return;

    const { roomID, gameState, role } = player;
    const opponent = role === "X" ? "O" : "X";
    if (gameState.drawOfferBy !== opponent) return reject("No draw offer");

    gameState.moveCount++;
    setDrawOffer(roomID, gameState, null);
    endGame(roomID, gameState, { winner: "DRAW", winningLine: [] });
  });

  // ---------- Rematch (samo poslije kraja serije) ----------

  const getPlayerAfterMatch = () => {
    const player = getPlayer(socket);
    if (!player) return null;
    const { gameState } = player;
    if (!gameState.matchWinner || !gameState.seats.X || !gameState.seats.O)
      return null;
    return player;
  };

  // Prvi igrac trazi rematch; kad i drugi posalje isti dogadjaj, krece nova serija
  socket.on("request_rematch", () => {
    const player = getPlayerAfterMatch();
    if (!player) return;
    const { roomID, gameState, role } = player;

    if (gameState.rematchRequestBy === otherRole(role)) {
      startRematch(roomID, gameState);
      return;
    }
    if (gameState.rematchRequestBy) return; // vec je trazio

    gameState.rematchRequestBy = role;
    io.to(roomID).emit("rematch_request", { by: role });
  });

  // Odbijen rematch: soba se brise i oba igraca idu na pocetnu stranicu
  socket.on("decline_rematch", () => {
    const player = getPlayerAfterMatch();
    if (!player) return;
    endAbandonedRoom(player.roomID, player.gameState);
  });

  socket.on("disconnect", () => {
    console.log(`Korisnik odspojen: ${socket.id}`);
    leaveSeat(socket);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Server pokrenut i sluša na portu ${PORT}`);
});
