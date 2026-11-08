# Strona prezentacyjna i demo

Strona prezentacyjna i przeglądarkowe demo są publikowane jako **statyczny GitHub Pages**. Nie wymagają serwera NestJS, bazy PostgreSQL ani konta w chmurze.

Docelowe adresy dla tego repozytorium:

- strona: `https://maciejdybowski.github.io/home-budget/`
- demo: `https://maciejdybowski.github.io/home-budget/demo/`

Strona wybiera EN lub PL według języka przeglądarki przy pierwszej wizycie; przełącznik zapamiętuje wybór. Możesz też wejść bezpośrednio pod `/en/` albo dopisać `?lang=en` / `?lang=pl`. Publiczne demo dzieli zapamiętany wybór języka ze stroną, ale wszystkie transakcje i ustawienia demo pozostają osobnym, fikcyjnym zbiorem w przeglądarce.

## Pierwsze włączenie

1. Opublikuj przygotowany, oczyszczony kod w repozytorium GitHub.
2. W repozytorium otwórz **Settings → Pages → Build and deployment → Source → GitHub Actions**.
3. Uruchom workflow **Publish presentation and browser demo** lub zaktualizuj kod na gałęzi `master`/`main`.

Workflow buduje stronę i demo, wykonuje testy Chromium oraz dwóch rozmiarów WebKit, a następnie wysyła jeden artefakt do Pages. Adres wdrożenia jest widoczny w środowisku `github-pages`. Nie wymaga osobistego tokenu; korzysta z uprawnień `pages: write` i `id-token: write` dla joba wdrażającego.

Przy zmianie właściciela repo lub nazwy sprawdź publiczne odnośniki do źródeł i instalatora. Bazowa ścieżka zasobów i adres canonical/OG są ustalane przez konfigurację Pages, więc publikacja pod ścieżką projektu nie wymaga serwera obsługującego SPA.

## Jak działa demo

- To ten sam interfejs Vue z osobnym adapterem danych, włączanym wyłącznie podczas budowania przez `VITE_DEMO_MODE=true`.
- Dane są fikcyjne. Obejmują przykładowy rok, transakcje, kategorie, sklepy, cele, opłaty i licznik.
- Zmiany są zapisywane w lokalnym `localStorage` pod kluczem przeznaczonym tylko dla demo. Nie ma połączenia do API ani produkcyjnego serwera.
- „Resetuj demo” usuwa lokalne zmiany i przywraca przykłady. Po zmianie miesiąca kalendarzowego dane demonstracyjne odnawiają się automatycznie.
- Działa przeglądanie, edycja transakcji, planowanie budżetu, sklepy, cele i opłaty. Import to jawnie oznaczona symulacja na gotowych przykładach; pełny parser CSV i uczenie reguł wymagają własnej instalacji.
- Demo nie rejestruje service workera i używa routingu z `#`, więc bezpośrednie otwarcie zakładki i odświeżenie działają na statycznym hostingu.
- Zwykły build produkcyjny nie używa adaptera demo. Publikacja Pages nie wystawia rzeczywistej bazy ani backendu.

## Lokalny podgląd

W `budget-app/`:

```sh
npm ci
npm run build:pages
node scripts/serve-pages.mjs
```

Strona: `http://127.0.0.1:4181/home-budget/`; demo jest pod `demo/`. To serwer podglądu, nie serwer produkcyjny. `PAGES_BASE=/` pozwala sprawdzić wariant domeny bez ścieżki repozytorium.

Testy:

```sh
npm run test:pages
```

Obejmują brak żądań API, nawigację, lokalny zapis i odświeżenie, scalanie/usuwanie sklepów, reset, symulację importu, budżet oraz jawne tworzenie kosztu opłaty. Strona jest sprawdzana także przez axe-core dla reguł WCAG A/AA. Test automatyczny nie zastępuje ręcznej oceny dostępności i wyglądu.

## Warstwa prezentacyjna

Źródła: `budget-app/site/`. Osobny build Vite, lokalne fonty DM Sans i Manrope (licencje OFL w `fonts-LICENSE.txt`), bez CDN i trackerów. Strona zawiera opis funkcji, działający przykładowy bilans, widok aplikacji, instalację z kopiowaniem komendy, FAQ, autora i MIT. Build generuje też obraz Open Graph dla podglądu udostępnionego linku.

GitHub Pages i GHCR to dwie niezależne publikacje: strona z demo może działać przed pierwszym wydaniem obrazów. Instalator w sekcji Docker zacznie być dostępny po opublikowaniu Release i publicznych pakietów GHCR.
