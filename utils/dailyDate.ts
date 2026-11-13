// Datumi za dnevni grid. Odvojeno od utils/tmdb.ts, jer ovo koristi i browser,
// a utils/tmdb.ts uvozi spisak odgovora koji ne smije u browser.

const DAY_MS = 24 * 60 * 60 * 1000;

// Prvi dnevni grid (#1). Broj se samo prikazuje u "Share" poruci.
const DAILY_GRID_START = Date.UTC(2026, 10, 13);

// Danasnji datum po UTC-u, isti za sve igrace bez obzira na vremensku zonu
export const todayUTC = (now = Date.now()) =>
  new Date(now).toISOString().slice(0, 10); // "2026-11-13"

// "2026-11-13" -> 1, "2026-11-14" -> 2...
export const dailyGridNumber = (date: string) =>
  Math.floor((Date.parse(date) - DAILY_GRID_START) / DAY_MS) + 1;

// Koliko ms do sledeceg grida (ponoc po UTC-u)
export const msUntilNextGrid = (now = Date.now()) =>
  DAY_MS - (now % DAY_MS);
