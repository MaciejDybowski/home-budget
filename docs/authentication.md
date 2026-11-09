# Opcjonalne logowanie i pierwsza konfiguracja

Od **2026.11.1** HomeBudget obsługuje jeden wspólny login i hasło na instalację.
Ustawiasz je **przy pierwszym otwarciu aplikacji w przeglądarce**, nie podczas
instalacji Dockera. Kilka urządzeń może logować się jednocześnie. Nie ma
rejestracji kolejnych kont, e-maili ani zewnętrznego dostawcy tożsamości.

## Ważne: kto pierwszy otworzy aplikację

**Kreator pierwszej konfiguracji nie wymaga kodu ani prywatnego linku.**
Pierwszy odwiedzający może ustawić login i hasło. Jeżeli publiczny adres pozna
ktoś inny, może skonfigurować dostęp przed właścicielem. Ukończ konfigurację
natychmiast po uruchomieniu i przed udostępnieniem adresu; w razie potrzeby
ogranicz dostęp do nowej instalacji na poziomie sieci do czasu konfiguracji.
HTTPS i CSRF nie potwierdzają, że pierwszy odwiedzający jest właścicielem.

Po zapisaniu konta kreator zamyka się trwale. Dwa równoczesne żądania nie
nadpiszą sobie konta: singleton w PostgreSQL dopuszcza wyłącznie jednego zwycięzcę.
API finansów jest chronione również przed utworzeniem konta.

## Tryb wybierany per instalacja

```dotenv
# Zaufany LAN/VPN, bez ekranu logowania i bez kreatora:
AUTH_MODE=none
```

```dotenv
# Publiczny adres HTTPS:
AUTH_MODE=local
APP_ORIGIN=https://budget.example.org
AUTH_COOKIE_SECURE=true
```

Nowa instalacja pyta o tryb (domyślnie wymaga logowania); możesz wybrać jawnie:

```sh
sh install.sh --auth
sh install.sh --no-auth
```

Nieinteraktywny `--auth` wymaga `APP_ORIGIN`, ale **nie wymaga loginu ani hasła**.
W trybie interaktywnym instalator zapyta o publiczny adres. Pytania korzystają
z `/dev/tty`, więc działają również podczas uruchamiania przez `curl | sh`.
Opcję `--demo` można połączyć z wyborem trybu.

Aktualizacje zachowują `.env`; uruchamiaj instalator bez opcji zmiany trybu.
Brak `AUTH_MODE` oznacza zgodne wstecz `none`. Zmiana trybu wymaga świadomej
edycji `.env` i odtworzenia kontenera. Nie wymaga przebudowy obrazów.

`APP_ORIGIN` jest dokładnym adresem przeglądarki, bez ścieżki. Dla zaufanego
lokalnego HTTP ustaw np. `APP_ORIGIN=http://localhost:3001` oraz jawnie
`AUTH_COOKIE_SECURE=false`. W internecie stosuj HTTPS i `true`.
Niepoprawna konfiguracja `local` zatrzymuje start, nie otwiera dostępu bez hasła.

## Pierwsze otwarcie

1. Otwórz adres aplikacji. W trybie `local` bez konta pojawi się „Ustaw login i hasło”.
2. Wybierz login: 1–64 liter ASCII, cyfr lub znaków `.`, `_`, `-`.
3. Wprowadź i powtórz hasło: minimum 12 znaków, maksymalnie 1024 bajty.
4. Wybierz „Utwórz dostęp”. Konto zostanie zapisane i nastąpi zalogowanie.
5. Kolejne urządzenia i następne wizyty zobaczą zwykły ekran logowania.

Login i bezpieczny hash Argon2id są w PostgreSQL (`AuthAccount`), nigdy jawne
hasło. Restart/usypianie Render nie uruchamia ponownie kreatora. `none` pomija
logowanie, ale nie usuwa wcześniej skonfigurowanego konta.

## Sesje i ochrona

- Globalna ochrona całego API, także starszych endpointów. Publiczne są tylko
  health, status auth, pierwsza konfiguracja, login i logout. Setup po utworzeniu
  konta zwraca konflikt, a nie zmienia poświadczeń.
- Losowa sesja na maksymalnie 7 dni; w bazie tylko hash tokenu. Cookie `HttpOnly`,
  `SameSite=Lax`, na HTTPS `Secure` z prefiksem `__Host-`; bez localStorage.
- Setup/login/logout i wszystkie zapisy wymagają Origin oraz tokenu CSRF.
- Limity prób w bazie przetrwają restart: 10 na 15 minut na adres połączenia,
  100 globalnie; osobny limit 10 prób konfiguracji na 15 minut. Dwie równoległe
  weryfikacje/hashowania Argon2id na proces. Nie ufamy dowolnemu `X-Forwarded-For`;
  za proxy kilka urządzeń może współdzielić limit adresu.
- Logout, wygaśnięcie i 401 czyszczą prywatny stan UI i edytory, anulują żądania
  i nie ponawiają automatycznie zapisów. Dane API mają `Cache-Control: no-store`.
- `local → none → local` nie przywraca starych sesji. Instancje współdzielące
  bazę muszą używać zgodnego trybu; odrębne gospodarstwa wymagają osobnych baz.

## Utrata hasła / reset administracyjny

Z katalogu instalacji (wymagany dostęp administracyjny do Dockera):

```sh
docker compose run --rm --no-deps --entrypoint node budget-app-backend scripts/auth-password.mjs --reset
```

Narzędzie poprosi o nowe hasło bez echa, zapisze jego hash i unieważni wszystkie
sesje. Zachowuje login oraz finanse i nie otwiera ponownie publicznego kreatora.
Obsługuje również `--stdin` dla chronionego wejścia automatyzacji. Nie przekazuj
hasła argumentem procesu i nie zapisuj go w historii powłoki.
Na Render administrator uruchamia to samo narzędzie w zaufanym środowisku
z bezpośrednim połączeniem do właściwej bazy; sekretów nie publikujemy.

## Aktualizacja i backup

Migracje dodają wyłącznie techniczne `AuthAccount`, `AuthSession`, `AuthAttempt`.
Finanse nie zmieniają kontraktu. Przed aktualizacją zrób backup; standardowy
Compose/skrypt Render uruchamia `prisma migrate deploy`. Healthcheck korzysta
z publicznego `/api/v1/health`, nie z chronionego stanu budżetu.

Sam upgrade starszej instalacji bez `AUTH_MODE` nie włącza ochrony. Dla publicznej
instancji ustaw `local`, HTTPS/Origin i od razu ukończ pierwszy kreator.
Backup bazy zawiera login, hash oraz sesje: zabezpieczaj go tak samo jak finanse.
Po odtworzeniu unieważnij poprzednie sesje, np. resetując hasło narzędziem.
