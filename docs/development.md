# Rozwój i testy

Node.js 24, npm, PostgreSQL 15+. Frontend i backend są w jednym repozytorium.

## Backend

W `budget-app-backend/` ustaw `DATABASE_URL` w `.env` lub otoczeniu, następnie:

```sh
npm ci
npm run db:deploy
npm run start:dev
```

`start:dev` generuje klienta Prisma. API działa na porcie `3000`.

## Frontend

W `budget-app/`:

```sh
npm ci
npm run dev
```

Frontend: `http://localhost:8080`, proxy API: `localhost:3000`. `VITE_API_URL` pozwala zmienić cel proxy.

## Testy

Backend:

```sh
npm run build
npm test -- --runInBand
```

Integracyjne wymagają osobnej bazy `budget_integration` lub `budget_test`. Najpierw zastosuj do niej migracje:

```sh
DATABASE_URL=postgresql://user:password@localhost:5432/budget_integration npm run db:deploy
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/budget_integration npm run test:e2e -- --runInBand
```

Te testy czyszczą wskazaną bazę. Nie wskazuj bazy z własnymi finansami.

Frontend:

```sh
npm run build
npm run lint
npx playwright install chromium webkit
npm run test:e2e
```

Playwright uruchamia zbudowany frontend na porcie `4180` z fikcyjnym API. Projekty: desktop Chromium oraz WebKit w dwóch rozmiarach telefonów. Na Linuksie zainstaluj przeglądarki przez `npx playwright install --with-deps chromium webkit`.

Stronę prezentacyjną i niezależne od API demo sprawdza `npm run test:pages` na porcie `4181`. Szczegóły lokalnego podglądu i publikacji: [pages.md](pages.md).

## Dane demonstracyjne

Po zbudowaniu backendu, wyłącznie dla pustej bazy:

```sh
npm run db:demo -- --confirm-empty
```

Seed działa w transakcji i odmawia dopisywania do niepustej bazy. Nie usuwa danych. Plik `examples/transactions.csv` zawiera tylko fikcyjne operacje.

CI sprawdza backend, frontend oraz osobną instalację Docker od pustej bazy, restart i ochronę przed ponownym seedowaniem. W repozytorium nie umieszczaj raportów i screenshotów z własnych finansów.

## Lokalne budowanie Docker — tylko dla deweloperów

Z katalogu głównego, z własnym `.env`:

```sh
docker compose -f docker-compose.yml -f compose.build.yml build budget-app-backend
docker compose -f docker-compose.yml -f compose.build.yml build budget-app-frontend
docker compose -f docker-compose.yml -f compose.build.yml up -d --no-build --pull never --wait
```

Standardowy `docker-compose.yml` nie zawiera sekcji `build`; używa gotowych obrazów GHCR. Nie dodawaj override deweloperskiego do paczki wdrożeniowej.

`sh scripts/test-distribution.sh` buduje obrazy po stronie wydawcy, wysyła do tymczasowego registry i instaluje samą paczkę wdrożeniową bez kontekstów źródeł. Sprawdza pustą bazę, demo, odmowę powtórnego seeda i zachowanie konfiguracji/danych po ponownym wdrożeniu. Używa osobnych kontenerów i portów `15000` oraz `43102`, sprzątanych po teście. Wymaga Dockera, Node.js i Pythona 3.
