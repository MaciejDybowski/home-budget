# Przygotowanie wydania

Publiczna dystrybucja zawiera źródła, migracje, ogólną dokumentację i wyłącznie fikcyjne przykłady. Konfiguracja konkretnego wdrożenia, sekrety i dane użytkownika należą do właściciela instalacji.

## Eksport źródeł

Z katalogu repozytorium:

```sh
python3 scripts/export-source.py /path/outside/repository/new-source-directory
```

Katalog docelowy nie może istnieć, jego rodzic musi istnieć. Eksport obejmuje bieżące pliki śledzone przez Git i nieignorowane nowe pliki. Pomija usunięte pliki, historię `.git`, storage, sekrety o rozpoznanych nazwach oraz artefakty. Symlinki wymagają ręcznego przeglądu.

To snapshot, nie nowe repozytorium: skrypt nie tworzy commitów, nie zmienia remote i nie publikuje niczego. Nie usuwa również wrażliwych danych z historii oryginalnego repo. Przed publikacją przejrzyj zawartość snapshotu, szczególnie przykłady i dokumentację. Nie uruchamiaj w snapshotcie własnej bazy przed utworzeniem publicznego repozytorium.

## Weryfikacja wydania

- Uruchom buildy i testy opisane w [development.md](development.md).
- Sprawdź `sh scripts/test-distribution.sh`: instalację z registry bez źródeł, migracje, demo i zachowanie danych po ponownym wdrożeniu.
- Sprawdź audyt zależności (`npm audit`, osobno `npm audit --omit=dev`) i oceń wyniki dla danej wersji. Audyt zależności nie jest audytem całej aplikacji ani obrazów bazowych.
- Utrzymuj zgodne kopie MIT w katalogu głównym i obu kontekstach Docker.
- Polecenie pobierania instalatora przez HTTP zadziała dopiero po opublikowaniu GitHub Release z jego plikami i publicznych obrazów.

## Publikowanie obrazów i wydania

Strona prezentacyjna i live demo mają osobny workflow GitHub Pages, opisany w [pages.md](pages.md). Nie wymagają wdrażania bazy lub API. Historyczne narzędzia przenoszenia danych ze starej aplikacji nie należą do publicznej dystrybucji; nowa baza inicjalizuje się automatycznie.

Registry: **GitHub Container Registry**, bez potrzeby zakładania konta Docker Hub. Docelowe obrazy:

- `ghcr.io/maciejdybowski/home-budget-backend:2026.11.0`
- `ghcr.io/maciejdybowski/home-budget-frontend:2026.11.0`

`.github/workflows/ci.yml` wykonuje kontrole po push/PR. `.github/workflows/release.yml` uruchamia się po opublikowaniu tagu `v2026.11.0` (analogicznie kolejne wersje) lub ręcznie w Actions ze wskazaniem istniejącego tagu. Nie uruchamia wdrożenia na żadnym serwerze.

Przebieg wydania:

1. Walidacja tagu i ustalenie konkretnego SHA kodu.
2. Wszystkie kontrole CI dla tego SHA.
3. Budowa i publikacja obu obrazów dla `linux/amd64` i `linux/arm64` przy użyciu Buildx/QEMU i `GITHUB_TOKEN` (`packages: write`). Nie potrzeba osobistego tokenu w repo.
4. Kontrola anonimowego dostępu i obecności obu architektur w manifestach.
5. Paczka wdrożeniowa ze wspólną, przypiętą wersją obrazów. GitHub Release zawiera archiwum oraz osobno `install.sh`, Compose, `env.example` i MIT. Wersje z sufiksem, np. `v0.2.0-rc.1`, trafiają do prerelease.

**Jednorazowo dla nowych pakietów:** GitHub → profil → Packages → ustawienia obu pakietów → Change visibility → **Public**. Samo publiczne repo nie gwarantuje publicznego pakietu. Jeśli pierwsze wydanie zatrzyma się na kontroli anonimowego dostępu, ustaw widoczność i ponów nieudane joby. W razie ograniczeń organizacji sprawdź również uprawnienia Actions do zapisu pakietów.

Workflow nie publikuje paczki użytkowej, dopóki anonimowy dostęp nie działa. Nie nadpisuj istniejącego tagu wersji innym kodem. Aktualizacja użytkowników jest jawna przez `HOMEBUDGET_VERSION`, bez automatycznego przełączania na nowe obrazy.

Lokalne przygotowanie samej paczki, bez publikowania:

```sh
python3 scripts/package-release.py 2026.11.0 /existing/parent/new-release-directory
```

W przypadku forka opcjonalny trzeci argument ustala właściciela GHCR; workflow ustala go z właściciela repozytorium. Adresy wydania i strony zakładają repozytorium `home-budget`.
