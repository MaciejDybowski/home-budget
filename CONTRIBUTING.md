# Udział w rozwoju HomeBudget

Zacznij od [instrukcji deweloperskiej](docs/development.md) i [architektury](docs/architecture.md).

- Zgłoszenie błędu powinno zawierać oczekiwane zachowanie, sposób odtworzenia i wersję środowiska. Wyciągi, logi i screenshoty przygotuj na fikcyjnych danych.
- Zmiany kontraktu API obejmują frontend i backend. Zmiany schematu wymagają migracji Prisma.
- Dla logiki finansowej testuj zachowanie i niezmienność danych. Plany opłat, zwroty, transfery i wycofywanie importów mają odrębną semantykę.
- Nie dodawaj sekretów, danych kont bankowych, dumpów, lokalnych instrukcji serwerowych ani storage bazy.
- Przed pull requestem wykonaj odpowiednie buildy i testy opisane w dokumentacji.

Wkład do projektu jest udostępniany na licencji MIT. Zachowuj informacje o prawach autorskich i licencjach zależności. Przed dużą zmianą architektury opisz pomysł w zgłoszeniu.
