# Hitster – domowa gra muzyczna

Demo gry w stylu **Hitster** zbudowane w Nuxt 4, Nuxt UI 4, Prisma i MySQL (MariaDB). Aplikacja ma ekran startowy z pokojami, dołączanie kodem lub kodem QR, import piosenek z panelu admina oraz demo odtwarzania z odliczaniem, zasłoniętym teledyskiem i automatyczną odpowiedzią.

## Funkcje

- ekran startowy z kafelkami **Stwórz pokój** i **Dołącz do pokoju**,
- nick zapisany w cookie (bez logowania i bez konta),
- pokój z 4-cyfrowym kodem, kodem QR dla hosta i limitem 8 graczy,
- dołączanie przez kod albo skaner QR kamery,
- widok pokoju z potwierdzeniem dołączenia, nazwą hosta i kodem QR,
- import piosenek z `/admin/insert-songs` (JSON, ochrona sekretem z env),
- losowanie piosenki z bazy (`GET /api/songs/random`),
- odliczanie **3, 2, 1** przed odtworzeniem,
- zasłonięty teledysk przez pierwsze 15 sekund (panel audio, bez ujawniania obrazu),
- automatyczna pauza i odkrycie odpowiedzi po 15 sekundach,
- ponowne odtworzenie fragmentu bez zmiany utworu,
- zapis `lastPlayed` przy każdym losowaniu,
- interfejs **PL/EN** z przełącznikiem języka i zapisem wyboru w cookie,
- tryb jasny/ciemny i responsywny layout (Nuxt UI).

## Stos

- [Nuxt 4](https://nuxt.com) + [Nuxt UI 4](https://ui.nuxt.com)
- [Prisma 5](https://www.prisma.io) + MySQL/MariaDB (domyślnie), SQLite jako fallback offline
- [@nuxtjs/i18n](https://i18n.nuxtjs.org)
- YouTube IFrame Player API
- `qrcode.vue` (generowanie QR) i `jsqr` (skanowanie QR)
- TypeScript, ESLint, pnpm

## Szybki start

```bash
pnpm install
cp .env.example .env      # jeśli nie masz jeszcze pliku .env
pnpm db:push              # utworzenie tabel w MySQL
pnpm db:seed              # 11 przykładowych utworów w 2 kategoriach
pnpm dev                  # http://localhost:3000
```

Plik `.env` powinien zawierać dane dostępowe do MySQL, sekret admina oraz klucz YouTube Data API:

```dotenv
DATABASE_URL="mysql://UZYTKOWNIK:HASLO@HOST:3306/NAZWA_BAZY"
ADMIN_SECRET="wygeneruj-losowy-sekret"
NUXT_YOUTUBE_API_KEY="klucz-youtube-data-api-v3"
NUXT_YOUTUBE_REGION_CODE="PL"
```

Klucz jest używany tylko po stronie serwera. Jeżeli go nie ustawisz, aplikacja odtworzy wyłącznie utwory z już zweryfikowanym `youtubeId`; nowe utwory bez ID nie zostaną rozwiązane.

Sekret wygenerujesz np. przez `openssl rand -hex 16`. Panel admina otwiera się pod adresem:

```text
http://localhost:3000/admin/insert-songs?secret=TWOJ_ADMIN_SECRET
```

Bez poprawnego sekretu strona pokazuje „Brak dostępu”, a endpoint importu zwraca `401`.

## Trasy

| Ścieżka | Opis |
| --- | --- |
| `/` | ekran startowy z kafelkami |
| `/create` | utworzenie pokoju i wpisanie nicku |
| `/join` | dołączenie kodem lub skanem QR |
| `/room/[code]` | potwierdzenie dołączenia, host, kod i QR |
| `/play` | demo losowania, odliczania i odpowiedzi |
| `/admin/insert-songs?secret=...` | import piosenek z JSON |

## Import piosenek

Panel admina przyjmuje tablicę piosenek albo obiekt z polem `songs`:

```json
{
  "songs": [
    {
      "title": "Tytuł",
      "artist": "Wykonawca",
      "releaseYear": 2024,
      "startTime": 18,
      "category": "Hity"
    }
  ]
}
```

- `youtubeId` jest opcjonalny — możesz go pominąć, podać `null` albo pusty string. Wtedy serwer znajdzie embedowalne audio przy pierwszym odtworzeniu i zapisze ID w bazie,
- jeżeli podasz `youtubeId`, zostanie on zweryfikowany przy pierwszym użyciu; zły lub zablokowany film zostanie zastąpiony,
- `startTime` jest opcjonalny i domyślnie wynosi `0`,
- import jest idempotentny — rekordy są dopasowywane po tytule, artyście i roku wydania,
- kategorie są tworzone automatycznie (`upsert` po nazwie),
- błędne dane zwracają `422` z opisem problemu.

Import obsługuje backend: `POST /api/admin/songs/import` z nagłówkiem `x-admin-secret`. Weryfikacja sekretu odbywa się przez `GET /api/admin/verify`. Sekret jest prywatnym `runtimeConfig` i nie trafia do klienta.

## Pokoje i sesja

- Pokój tworzy host; pozostali dołączają 4-cyfrowym kodem lub kodem QR.
- QR hosta koduje adres `/join?code=XXXX`, więc po zeskanowaniu kod jest od razu wypełniony.
- Nick i członkostwo w pokoju są zapisywane w cookies (`musicline_session`, `musicline_name`), a język w `musicline_locale`.
- Aktywne pokoje, gracze, osie czasu, rundy, żetony i pojedynki są zapisywane **w bazie danych** (maks. 8 graczy, ważność 12 godzin). Restart serwera nie czyści rozgrywki.
- Każda akcja gry jest natychmiast rozsyłana przez WebSocket (`/ws`) do wszystkich uczestników pokoju. Klient nie odpytuje serwera w pętli — po utracie połączenia automatycznie się łączy i pobiera świeży stan.
- Snapshot wysyłany przez WebSocket jest personalizowany: tylko host widzi piosenkę w fazie `listening`, a cudze typy lat pozostają ukryte do odsłonięcia rundy.
- Skaner QR wymaga kamery i bezpiecznego kontekstu (`https://` lub `localhost`). Na telefonie przez LAN może być potrzebny HTTPS/tunel; kod można zawsze wpisać ręcznie.
- Aby otworzyć aplikację z telefonu w sieci lokalnej, uruchom `pnpm dev --host` i wejdź na adres IP komputera.

## Przebieg losowania

1. Kliknięcie **Losuj piosenkę** wywołuje `POST /api/rooms/[code]/draw`.
2. Backend wybiera utwór i sprawdza jego `youtubeId`. Utwory bez ID lub z niepasującym filmem są rozwiązywane przez YouTube Data API: wyszukiwanie preferuje embedowalne audio (kanały „- Topic”), a wynik jest zapisywany w bazie razem z poprawionym `startTime`.
3. Na ekranie pojawia się odliczanie **3, 2, 1**, a teledysk jest zasłonięty nieprzezroczystym panelem audio.
4. Po odliczaniu odtwarzacz startuje od pola `startTime`; teledysk jest zasłonięty nieprzezroczystym panelem audio (sam iframe pozostaje zamontowany i gra).
5. Po 15 sekundach odtwarzanie jest pauzowane, panel audio znika, a karta odpowiedzi odsłania tytuł, wykonawcę, rok i kategorię.
6. **Powtórz fragment** cofa odtwarzanie do `startTime`; nie ma już przycisku „Pokaż odpowiedź”.
7. Jeśli w rundzie nie przyznano żadnego żetona, kliknięcie **Następny gracz** / **Pomiń kartę** pokazuje potwierdzenie — można wrócić i przyznać żeton albo przejść dalej.

Jeśli IFrame API zgłosi błąd mimo weryfikacji, host automatycznie dostaje inny utwór (maks. 3 próby), a wadliwe ID trafia do listy odrzuconych. Błąd **153** oznacza brak nagłówka Referer (np. rozszerzenie prywatności) — aplikacja ustawia `Referrer-Policy` i pokazuje osobną podpowiedź zamiast zapętlać losowanie.

Timer startuje dopiero w stanie `PLAYING` i liczy 15 sekund od faktycznego początku fragmentu (`getCurrentTime()` osiąga `startTime`). Jeśli przeglądarka zablokuje autoplay, na panelu audio pojawi się przycisk **Odtwórz fragment** — dopiero po nim odpowiedź odsłoni się automatycznie po 15 sekundach.

Panel audio jest tylko nakładką: iframe YouTube zostaje w DOM na pełnym rozmiarze, więc odtwarzanie nie zależy od widoczności teledysku. Nie używamy `display: none`, `visibility: hidden` ani filtra `blur` na iframe — dzięki temu także na wolniejszych urządzeniach nie ma dodatkowego obciążenia GPU.

### Debug odtwarzania (opcjonalny)

Domyślnie stage jest zasłonięty nieprzezroczystym panelem audio — także w dev i w produkcji. Iframe YouTube pozostaje w DOM i gra w tle. Aby w dev odsłonić player i panel **DEBUG DEV**, dodaj `?debug=1`; na `localhost`/`127.0.0.1` działa to również w podglądzie builda. Panel pokazuje:

- `youtubeId`, `startTime`, tytuł i ID utworu,
- stan IFrame API (`PLAYING`, `BUFFERING`, `PAUSED`, …), aktualny czas i długość filmu,
- kod błędu YouTube i jego znaczenie (`101/150` = embedding zablokowany, `153` = brak Referera),
- licznik prób automatycznego redrawu i aktualny stan rundy,
- log zdarzeń `READY`, `PLAY`, `STATE`, `CLIP ANCHOR`, `ERROR`, `RECOVER`, `SYNC`.

Przyciski `play`, `pause`, `seek start`, `load` pozwalają sprawdzić sam player bez czekania na rundę; **kopiuj log** przenosi cały log do schowka. W produkcji panel i odsłonięty player są wyłączone; lokalnie w podglądzie builda można go włączyć przez `?debug=1` na `localhost`/`127.0.0.1`. `?debug=1&cover=1` zasłania teledysk **zostawiając panel debug** — tym można sprawdzić, że audio gra, gdy teledysk jest niewidoczny. `?debug=0` nadal działa jako jawne wyłączenie debugowania.

## Skrypty

| Skrypt | Opis |
| --- | --- |
| `pnpm dev` | serwer developerski |
| `pnpm build` | build produkcyjny |
| `pnpm preview` | podgląd builda (produkcja nie wczytuje `.env` — przekaż `DATABASE_URL`, `ADMIN_SECRET`/`NUXT_ADMIN_SECRET` oraz `NUXT_YOUTUBE_API_KEY` w środowisku) |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | sprawdzenie typów (`vue-tsc`) |
| `pnpm db:push` | synchronizacja schematu z bazą |
| `pnpm db:seed` | seed bazy (idempotentne `upsert`) |
| `pnpm db:studio` | Prisma Studio |

## Baza danych

Projekt domyślnie używa **MySQL/MariaDB** (`provider = "mysql"` w `prisma/schema.prisma`). Dane połączenia trzymaj w `.env`:

```dotenv
DATABASE_URL="mysql://UZYTKOWNIK:HASLO@HOST:3306/NAZWA_BAZY"
```

Po zmianie danych lub schematu:

```bash
pnpm db:push
pnpm db:seed
```

Jeśli w panelu hostingu MySQL odrzuca połączenie, sprawdź zdalny dostęp (whitelist IP) oraz hasło użytkownika bazy. Błąd `P1000` / `ER_ACCESS_DENIED_ERROR 1045` oznacza nieprawidłowe dane logowania lub brak dostępu z Twojego IP — nie jest to błąd aplikacji.

SQLite pozostaje dostępny jako fallback offline: zmień `provider` na `"sqlite"`, ustaw `DATABASE_URL="file:./dev.db"` i wykonaj `pnpm db:push && pnpm db:seed`. Względna ścieżka SQLite jest rozwiązywana względem katalogu `prisma/`, a w `lib/prisma.ts` normalizowana do ścieżki absolutnej.

### Wdrożenie na Vercel

1. W **Project Settings → Environment Variables** ustaw `DATABASE_URL`, `ADMIN_SECRET` i opcjonalnie `NUXT_YOUTUBE_API_KEY`.
2. Jednorazowo po każdej zmianie schematu zsynchronizuj bazę, używając produkcyjnego adresu:

   ```bash
   DATABASE_URL="mysql://..." pnpm db:push
   ```

   Nie trzeba czyścić bazy. `db push` dodaje brakujące tabele (`Room`, `RoomPlayer`, `RoomRound`, …) i nie usuwa zaimportowanych utworów.
3. Build automatycznie wykonuje `prisma generate` (`hooks['build:before']` w `nuxt.config.ts`). Dzięki temu Vercel nie użyje starego, zcache’owanego klienta Prisma po zmianie schematu.
4. Jeśli poprzedni deploy kończył się błędem `Cannot read properties of undefined (reading 'deleteMany')` przy `POST /api/rooms`, oznaczało to właśnie stary Prisma Client bez modelu `Room`, a nie brak danych. Po wdrożeniu tej wersji wykonaj **Redeploy** (opcjonalnie z wyczyszczeniem cache).

WebSocket jest obsługiwany przez Vercel Functions, ale pojedyncze połączenie jest przypięte do jednej instancji funkcji. Aby zmiany z akcji HTTP obsłużonej przez inną instancję również docierały do graczy, każda instancja nasłuchująca pokoju sprawdza jego `revision` w bazie raz na sekundę. Broadcast w obrębie tej samej instancji jest natychmiastowy, a między instancjami stan dogania się w maksymalnie ~1 s. Przy bardzo dużym ruchu warto zamiast tego podłączyć współdzielony pub/sub (np. Redis, Pusher lub Ably).

## Struktura projektu

```text
app/
├─ app.vue                       # shell: UApp, UHeader, UMain, UFooter, i18n
├─ components/
│  ├─ AnswerCard.vue             # karta odpowiedzi
│  ├─ CountdownOverlay.vue       # odliczanie 3-2-1
│  ├─ LocaleSwitcher.vue         # przełącznik PL/EN
│  ├─ PageHeading.vue            # wspólny nagłówek stron
│  ├─ QrScannerModal.vue         # skaner QR kamery (jsQR)
│  ├─ RoomCreateForm.vue         # formularz tworzenia pokoju
│  ├─ RoomJoinForm.vue           # formularz dołączania
│  ├─ RoomQrCode.vue             # generowanie QR pokoju
│  ├─ SongImportForm.vue         # formularz importu JSON
│  └─ StartTile.vue              # kafelek ekranu startowego
├─ composables/
│  ├─ usePlayerSession.ts        # sesja gracza w cookie
│  └─ useSongGame.ts             # YouTube, countdown, audio stage, timer, auto-answer
├─ pages/
│  ├─ index.vue                  # ekran startowy
│  ├─ create.vue / join.vue      # pokoje
│  ├─ room/[code].vue            # widok pokoju
│  ├─ play.vue                   # demo gry
│  └─ admin/insert-songs.vue     # panel importu
├─ types/                        # Song, PlayerSession, YouTube
└─ utils/                        # game, youtube, qr, admin
i18n/locales/                    # pl.json, en.json
server/
├─ api/
│  ├─ rooms/                     # create, get, join
│  ├─ admin/                     # verify, import
│  └─ songs/random.get.ts        # losowanie
├─ routes/
│  └─ ws.ts                      # WebSocket pokoju (broadcast stanu)
└─ utils/                        # room-store (Prisma), room-socket, song-import, youtube-availability, youtube-resolver, admin
shared/
├─ types/                        # Room, SongImport
└─ utils/                        # player, room code
lib/prisma.ts                    # singleton PrismaClient
prisma/
├─ schema.prisma                 # utwory, pokoje, gracze, rundy i żetony
└─ seed.ts                       # przykładowe utwory
```

## Uwagi

- YouTube może zablokować autoplay z dźwiękiem, dopóki użytkownik nie wejdzie w interakcję ze stroną. Wtedy wystarczy kliknąć **Odtwórz fragment**.
- Utwory z wyłączonym osadzaniem są pomijane przy losowaniu; jeśli IFrame API zwróci błąd mimo to, host automatycznie dostaje kolejny utwór.
- Przy niektórych teledyskach YouTube wyświetla reklamy – mogą one zaburzyć odliczanie.
- Metadane piosenki są dostępne w stanie klienta od razu po losowaniu; karta odpowiedzi jest wizualnie ukryta. To demo do gry w domu, nie aplikacja konkursowa.

