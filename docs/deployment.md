# Instalacja i utrzymanie

## Nowa instalacja

Użyj `install.sh` według README. Domyślnie powstaje pusta baza; kategorie, źródła przychodów i rachunki dodaje się w „Więcej”. Jedna instalacja na jednym hoście korzysta z nazw kontenerów `budget-postgres`, `budget-backend`, `budget-frontend`.

Przy pobieraniu instalatora przez `curl`:

- `HOMEBUDGET_DIR` ustala katalog instalacji (domyślnie `./homebudget`). Istniejący katalog nie jest nadpisywany.
- Instalator z GitHub Release jest przypisany do wersji tego wydania. `HOMEBUDGET_VERSION` pozwala jawnie wskazać inną opublikowaną wersję obrazów i paczki wdrożeniowej. Nie jest to automatyczny updater.
- `--demo` jawnie dodaje fikcyjne dane, tylko do pustej bazy.

Instalator pobiera gotowe obrazy z GHCR dla amd64 lub arm64. Nie pobiera źródeł aplikacji i nigdy nie uruchamia lokalnego builda. Publiczne pakiety nie wymagają konta ani tokenu. Wydanie zawiera `homebudget-compose.tar.gz`: Compose, instalator, przykładową konfigurację, MIT i instrukcje. Pierwszy start wymaga Internetu.

Alternatywnie skopiuj `env.example` do `.env`, wygeneruj hasło (np. `openssl rand -hex 32`) i wykonaj:

```sh
docker compose up -d
```

## Konfiguracja

| Zmienna                           | Znaczenie                                                                |
| --------------------------------- | ------------------------------------------------------------------------ |
| `POSTGRES_USER`                   | Użytkownik PostgreSQL, domyślnie `postgres`                              |
| `POSTGRES_DB`                     | Nazwa bazy, domyślnie `budgetdb`                                         |
| `POSTGRES_PASSWORD`               | Wymagane hasło; instalator generuje losową wartość hex                   |
| `HOMEBUDGET_VERSION`              | Wspólna wersja backendu, migratora i frontendu, np. `2026.11.0`          |
| `FRONTEND_BIND`                   | Interfejs sieciowy, domyślnie `0.0.0.0`; lokalnie można użyć `127.0.0.1` |
| `FRONTEND_PORT`                   | Port aplikacji, domyślnie `3001`                                         |
| `BACKEND_IMAGE`, `FRONTEND_IMAGE` | Opcjonalne własne nazwy/tagi obrazów                                     |

Hasło jest częścią `DATABASE_URL`: przy konfiguracji ręcznej użyj znaków bezpiecznych w URL, np. losowej wartości hex. Zmiana `.env` nie zmienia hasła użytkownika w już istniejącym PostgreSQL.

PostgreSQL i API nie publikują swoich portów na hoście. Frontend proxy’uje `/api` wewnątrz sieci Compose. Przez LAN używa się adresu hosta, nie `localhost` innego urządzenia.

## Obsługa

Z katalogu instalacji:

```sh
docker compose ps -a
docker compose logs --since 10m
docker compose stop
docker compose start
```

Migrator `Exited (0)` oznacza prawidłowe zakończenie. Backend startuje po migracjach, frontend po gotowości backendu. Kontenery aplikacji i PostgreSQL startują ponownie z Dockerem.

## Aktualizacja istniejącej instalacji

1. Wykonaj i sprawdź [backup](backups.md).
2. Zachowaj `.env`, `pgdata/` i własne override Compose.
3. Pobierz paczkę wdrożeniową wybranego wydania i zaktualizuj pliki Compose/instalatora, zachowując swoje `.env` i `pgdata`. Instalator pobierany przez `curl` nie nadpisuje istniejącego katalogu.
4. Ustaw opublikowaną wersję w `HOMEBUDGET_VERSION` w `.env`. Backend, migrator i frontend muszą być z tego samego wydania.
5. Wykonaj `sh install.sh`: najpierw pobierze obrazy (błąd pobrania nie zatrzyma starej aplikacji), następnie zatrzyma frontend/backend, automatycznie zaktualizuje schemat i uruchomi nowe usługi. Przy zmianie schematu zrób ostatnią kopię po zatrzymaniu zapisów. Szczegóły mechanizmu: [database.md](database.md).
6. Sprawdź stan usług i swoje dane. Nie uruchamiaj seeda demo.

`docker compose down` nie usuwa bind-mountu `pgdata`, ale ręczne skasowanie tego katalogu usuwa dane. Nie jest to element aktualizacji.

Wersje są przypięte do tagów, a nie `latest`. Sama publikacja nowszego wydania nie zmienia działającej instalacji. Nie używaj ponownie numeru wydania dla innego kodu.

## Telefon i HTTPS

Dla PWA skonfiguruj reverse proxy z certyfikatem zaufanym na urządzeniach. Dobór domeny, DNS i certyfikatu zależy od własnej sieci. Aplikacja nie zawiera konfiguracji konkretnego routera lub serwera. Bez logowania korzystaj wyłącznie z zaufanej sieci/VPN.
