import { nanoid } from "nanoid";

// Sve se cuva u sessionStorage: vrijedi samo za ovaj tab i prezivi refresh.
// Pristup je u try/catch jer sessionStorage moze biti blokiran (privatni mod, in-app browseri).

const PLAYER_ID_KEY = "movie-ttt-player-id";
const joinedKey = (roomID: string) => `movie-ttt-joined-${roomID}`;

// Stalni ID igraca za ovaj tab - server po njemu vraca igraca na njegovo mjesto
export const getPlayerId = () => {
  try {
    let id = sessionStorage.getItem(PLAYER_ID_KEY);
    if (!id) {
      id = nanoid();
      sessionStorage.setItem(PLAYER_ID_KEY, id);
    }
    return id;
  } catch {
    return nanoid();
  }
};

// Da li je ovaj tab vec usao u sobu (kreator, ili igrac koji je kliknuo "Join")
export const hasJoinedRoom = (roomID: string) => {
  try {
    return sessionStorage.getItem(joinedKey(roomID)) === "1";
  } catch {
    return false;
  }
};

// Programi koji sami otvaraju linkove (preview u chat aplikacijama, crawleri,
// headless browseri). Namjerno ne hvata in-app browsere (Messenger, Viber...)
// jer u njima link otvaraju pravi ljudi.
const BOT_UA =
  /bot\b|bot\/|crawler|spider|preview|facebookexternalhit|headlesschrome|lighthouse/i;

export const looksLikeBot = () => {
  try {
    return navigator.webdriver === true || BOT_UA.test(navigator.userAgent);
  } catch {
    return false;
  }
};

// Poziva callback tek kad je stranica stvarno prikazana korisniku:
// nije unaprijed ucitana (prerender) i nije u pozadini.
// Vraca funkciju za otkazivanje.
export const whenPageIsShown = (callback: () => void) => {
  const doc = document as Document & { prerendering?: boolean };

  const check = () => {
    if (!doc.prerendering && doc.visibilityState === "visible") {
      stop();
      callback();
    }
  };

  const stop = () => {
    doc.removeEventListener("visibilitychange", check);
    doc.removeEventListener("prerenderingchange", check);
  };

  doc.addEventListener("visibilitychange", check);
  doc.addEventListener("prerenderingchange", check);
  check();

  return stop;
};

// Podesavanja koja kreator izabere na /room. Salju se serveru pri ulasku u
// sobu, a server ih koristi samo kad pravi novu sobu.
export interface RoomSettings {
  turnSeconds: 15 | 40 | 60 | null; // null = bez ogranicenja
}

const settingsKey = (roomID: string) => `movie-ttt-settings-${roomID}`;

export const saveRoomSettings = (roomID: string, settings: RoomSettings) => {
  try {
    sessionStorage.setItem(settingsKey(roomID), JSON.stringify(settings));
  } catch {
    // bez sessionStorage-a server koristi podrazumijevano vrijeme
  }
};

export const getRoomSettings = (roomID: string): RoomSettings | undefined => {
  try {
    const raw = sessionStorage.getItem(settingsKey(roomID));
    return raw ? (JSON.parse(raw) as RoomSettings) : undefined;
  } catch {
    return undefined;
  }
};

export const markRoomJoined = (roomID: string) => {
  try {
    sessionStorage.setItem(joinedKey(roomID), "1");
  } catch {
    // bez sessionStorage-a igrac ce poslije refresh-a morati ponovo kliknuti "Join"
  }
};
