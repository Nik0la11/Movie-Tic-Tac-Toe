# Ideje za kasnije

Stvari koje nisu hitne, ali ih treba imati u vidu.

**Preporučeni redosled:** 1 + 12 + 13 (brze popravke), pa 3 ili 6 kao prvi veći feature.

## Igra

1. **Isti film ne može dva puta.** Sada isti film može da se upiše u više
   polja. Server treba da pamti iskorišćene filmove u partiji (`usedMovieIds`
   u `gameStates[roomID]`) i da odbije ponovljeni film.
2. **"Steal" pravilo.** Igrač može da preuzme protivnikovo polje ako upiše
   *drugi* film koji takođe odgovara tom polju. Partije su dinamičnije i ređe
   se završavaju nerešeno.
3. **Prikaz mogućih odgovora posle partije.** Kad se partija završi, klik na
   polje pokaže 3–5 filmova koji su odgovarali. Server ima `movies-index.json`,
   pa je dovoljno da ih pošalje tek **posle** kraja partije (nikad tokom igre).
4. **Nivoi težine pri kreiranju sobe.** Easy: poznati glumci i žanrovi.
   Hard: reditelji i decenije.
5. **Nove vrste kategorija:** Oscar dobitnici, ocena > 8, trajanje > 2h,
   studio (Pixar, A24), zemlja. Proširiti `scripts/fetch-top-rated-movies.ts`
   i `scripts/movies-index.ts`.

## Singleplayer

6. **Daily grid.** Svi dobiju isti grid tog dana, kao Wordle (seed = datum).
   Na kraju dugme "Share" kopira rezultat kao 🟩🟥 kvadrate. Ovo najbolje
   vraća ljude u igru.
7. **Igra protiv bota.** Bot igra kao O, sa nivoom težine. Koristi isti
   server kod kao multiplayer.

## Multiplayer doživljaj

8. **Nadimci.** Upiše se ime pri ulasku, pa umesto YOU/OPP piše npr. *Nikola : Marko*.
9. **Obaveštenje kad si na potezu.** Kad je tab u pozadini, naslov taba se
    promeni u "🔴 Your turn!" i pusti se kratak zvuk.
10. **Emoji reakcije** (😂 🔥 😱) koje kratko iskoče protivniku. Zabavnije od
    chata i ne treba moderacija.
11. **Quick play.** Dugme koje te spoji sa nasumičnim igračem koji čeka, bez
    slanja linka. Procena: pola dana do dan posla.
    - Server: red čekanja (`find_match`, `cancel_match`). Kad stigne drugi
      igrač, napravi se soba sa rezervisanim mestima za oba `playerId`-a,
      bez zamene gosta pre prvog poteza. Obojici se pošalje
      `match_found { roomID }`, pa ulaze preko postojećeg `join_room`.
    - Obavezno: izbaciti igrača iz reda na Cancel ili prekid veze, i ne spajati
      isti `playerId` sa samim sobom.
    - Podešavanja: fiksna (npr. 40s, Best of 3) ili spajanje samo igrača sa
      istim izborom.
    - Glavni problem je malo igrača. Dodati broj igrača koji traže igru,
      bota kao rezervu posle ~30s (ideja 7) ili "Invite a friend instead".

## Unapređenja postojećeg

12. **Debounce pretrage.** API se sada zove na svako slovo, a odgovori mogu da
    stignu pogrešnim redom. Treba ~300ms kašnjenja i odbacivanje zastarelih
    odgovora (AbortController).
13. **Prozor za pretragu na malim telefonima.** Ima fiksnu širinu `w-96`
    (384px), a mnogi telefoni su široki 360px, pa izlazi van ekrana. Promeniti
    u `w-full max-w-sm mx-4`.
14. **Tastatura u pretrazi:** strelice gore/dole i Enter za izbor filma.
15. **Naziv filma na zauzetom polju.** Tap ili hover pokaže koji je film
    upisan. Sada se vidi samo poster prekriven sa X/O.

## Tehnika i bezbednost

16. ~~**Zaključati `/api/movies`.**~~ **Urađeno.** Umesto otvorenog proxyja
    postoje samo `/api/movies/search?query=...` i `/api/movies/[id]`.
17. **Rate limiting** na socket događaje (`join_room`, `make_move`) i API rute,
    da niko skriptom ne pravi hiljade soba ili ne troši TMDB ključ.
18. **Automatski testovi servera** u projektu (`server/tests/`, `npm run test:server`):
    tajmer, serija, nerešeno, napuštanje igre.
19. **Brže otkrivanje izlaska.** Detalji su u sledećoj sekciji.

## Brže otkrivanje igrača koji je izgubio internet

**Trenutno stanje:** kada igrač zatvori tab, server to sazna odmah (<1s).
Kada mu samo nestane interneta (lift, tunel, ugašen WiFi, prazna baterija),
browser ne stigne ništa da javi. Server to otkrije tek preko heartbeat-a
(ping) socket.io-a, a podrazumevane vrednosti su:

- `pingInterval: 25000` - server šalje ping svakih 25s
- `pingTimeout: 20000` - klijent mora da odgovori u roku od 20s

Otkrivanje zato traje **0–45s**. Zatim ide još 10s čekanja (`ABANDON_MS`),
pa protivnik poruku "Your opponent left the game" dobije tek posle **10–55s**.

**Ideja:** skratiti heartbeat u `server/server.js`, gde se pravi `new Server(server, { ... })`:

```js
const io = new Server(server, {
  pingInterval: 10000,
  pingTimeout: 5000,
  cors: { ... },
});
```

Tada se mrtva veza otkrije za **najviše ~15s**, a cela poruka stigne za ~25s.

**Cena:**
- nešto više malih poruka između servera i klijenta (zanemarljivo)
- igrači sa lošim internetom češće "ispadaju", ali se automatski vraćaju
  na svoje mesto ako se veza oporavi u roku od 10s
