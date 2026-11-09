# Wdrożenie zewnętrzne — Render + Neon

**Na tym etapie wyłącznie fikcyjne dane testowe. Aplikacja nie ma logowania:
każdy mający dostęp do adresu może odczytywać, zmieniać i usuwać dane. HTTPS,
nieznany adres i blokada indeksowania nie zastępują uwierzytelniania.**

Wariant jest niezależny od instalacji domowej Docker Compose. Nie kopiuj do niego
domowej bazy, plików CSV ani konfiguracji serwera. Logowanie jest osobnym etapem.

## Architektura

- Jedna usługa Node.js na Render serwuje frontend Vue i API NestJS pod tym samym
  adresem HTTPS. Nie potrzebujesz GitHub Pages, Nginx ani osobnej domeny.
- Dane są w zarządzanym PostgreSQL Neon, nie na nietrwałym dysku Render.
- `render.yaml` opisuje darmową usługę, domyślnie we Frankfurcie. W miarę
  możliwości wybierz region blisko istniejącego projektu Neon.
- Automatyczne wdrażanie zmian jest wyłączone. Aktualizacje uruchamiaj świadomie.
- Nie jest to build demonstracyjny GitHub Pages: operacje rzeczywiście zapisują
  dane we wspólnej bazie, ale wolno używać tylko danych fikcyjnych.

## 1. Neon

Użyj oddzielnego projektu/bazy dla wdrożenia zewnętrznego. W panelu **Connect**
pobierz dwa adresy połączenia dla tej samej gałęzi, bazy i roli:

- `DATABASE_URL`: pooled connection, host z `-pooler` — aplikacja;
- `DATABASE_URL_UNPOOLED`: direct connection, bez `-pooler` — migracje i narzędzia bazy.

Zachowaj parametry TLS dostarczone przez Neon. Nie ustawiaj
`NODE_TLS_REJECT_UNAUTHORIZED=0` ani `rejectUnauthorized: false`.
Nie umieszczaj adresów połączeń w kodzie, YAML ani zmiennych `VITE_*`.

Prisma CLI używa `DATABASE_URL_UNPOOLED`, jeżeli jest ustawione (obsługuje też
alternatywną nazwę `DIRECT_URL`); istniejący Compose nadal
używa wyłącznie `DATABASE_URL`.

## 2. Render

Po opublikowaniu plików konfiguracyjnych w GitHub:

1. W Render wybierz **New → Blueprint**, podłącz repozytorium i wybierz gałąź
   z zatwierdzoną konfiguracją `render.yaml`.
2. Sprawdź plan **Free**, region i wyłączone automatyczne wdrożenia.
3. Uzupełnij sekrety `DATABASE_URL` i `DATABASE_URL_UNPOOLED` adresami z Neon.
4. Utwórz usługę. Render wykona `scripts/render-build.sh`, następnie
   `scripts/render-start.sh` i udostępni adres `https://…onrender.com`.

Alternatywnie utwórz **Web Service** z runtime Node, katalogiem głównym repo,
build command `sh scripts/render-build.sh`, start command
`sh scripts/render-start.sh` i health check `/api/v1/health`. Zmienne i wersję
Node przepisz z `render.yaml`. Nie używaj Dockerfile backendu — nie zawiera UI.

Build instaluje narzędzia developerskie, buduje obie aplikacje, kopiuje frontend
do `budget-app-backend/public` i usuwa zależności developerskie backendu.
Na czas builda skrypt ustawia stertę Node na 1536 MB; pipeline Render ma osobne
zasoby (Starter: 8 GB RAM). Limit 384 MB ze zmiennych usługi dotyczy uruchomionej
aplikacji, a nie kompilacji — type-check Vue nie mieści się w 384 MB.
`SERVE_FRONTEND=true` włącza obsługę frontendu w NestJS; bez tej zmiennej
dotychczasowy backend Compose działa tak jak wcześniej.

## 3. Migracje i kontrola działania

Darmowy Render nie obsługuje `preDeployCommand`. Dlatego skrypt startowy wykonuje
`prisma migrate deploy` przed uruchomieniem serwera. Błąd migracji zatrzymuje start.
Build nie wykonuje migracji, a start nie zasiewa demo ani nie resetuje danych.

Sprawdź:

- poprawne zakończenie migracji oraz start serwera w logach Render;
- `/api/v1/health` → `{"status":"ok"}` (liveness, **nie** test bazy);
- stronę główną i odświeżenie podstrony aplikacji;
- odczyt API `/api/v1/household?month=YYYY-MM`;
- zapis fikcyjnej kategorii/wydatku i ich obecność po restarcie usługi.

Health check nie wykonuje zapytań SQL, aby nie utrzymywać aktywnego compute Neon
samymi sondami infrastruktury. Połączenie z bazą trzeba zweryfikować osobno przez API.

## Aktualizacje, ograniczenia i backup

- Render Free usypia usługę po 15 minutach bez ruchu; pierwsze wejście może
  wymagać około minuty oczekiwania. Sprawdzaj aktualne limity usług.
- Darmowy limit pamięci Render to 512 MB; Node ma limit sterty 384 MB. Nie jest
  to limit całej pamięci procesu. Sprawdź logi i zużycie przy większych importach.
- Migracje uruchamiane przy starcie wymagają zmian zgodnych z nadal działającą
  poprzednią wersją. Przed zmianami schematu wykonaj backup i oceń zgodność.
- Render **Manual Deploy** wdraża kod niezależnie od tagów obrazów Compose;
  zapisz commit wdrożenia. Powrót do starszego kodu nie cofa migracji bazy.
- Backup wykonuj `pg_dump` przez bezpośrednie połączenie, przechowuj zaszyfrowaną
  kopię poza Neon i sprawdzaj odtworzenie na osobnej bazie. Nie zakładaj, że
  darmowy plan zastępuje własny backup. Nie dodawaj dumpów do repozytorium.
- Nie publikuj sekretów w logach, zrzutach ekranu ani zgłoszeniach błędów.

Źródła: [Render Free](https://render.com/docs/free),
[Blueprint](https://render.com/docs/blueprint-spec),
[Neon](https://neon.com/pricing).
