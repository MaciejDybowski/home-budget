# Architektura HomeBudget

## Moduły i przepływ

- `budget-app/src/household/`: strony Vue, współdzielony stan (`store.ts`), edytory, import i wykresy.
- `budget-app-backend/src/household/`: API stanu domu, import CSV, analizy, sklepy, cele i plany opłat.
- `budget-app-backend/prisma/`: schemat PostgreSQL i pełna historia migracji.
- Nginx serwuje SPA i przekazuje `/api` do NestJS. Baza i API pozostają w sieci Compose.

To jedna przestrzeń gospodarstwa domowego, bez uwierzytelniania i podziału na tenantów. Nie jest usługą SaaS.

## Zasady danych

Kwoty finansowe są przechowywane jako `Decimal(14,2)`. Zwykłe wydatki to `EXPENSE` pomniejszone o `REFUND`. `TRANSFER` i `LOAN_OVERPAYMENT` mają osobną semantykę. Zakres `budget` uwzględnia wyłączenia z limitu, `ordinary` pokazuje także zwykłe wydatki poza limitem.

`Merchant` jest globalnym katalogiem. `MerchantsService` synchronizuje ID i tekstowe nazwy w wydatkach i regułach; odpowiada też za aliasy, scalanie, usuwanie i migawki wycofania importu. Ogólni operatorzy płatności nie identyfikują samodzielnie sklepu.

Import jest dwuetapowy: podgląd i jawne zatwierdzenie. `ImportBatch` grupuje zapisane operacje. Duplikaty bankowego ID sprawdzane są wspólnie dla wydatków i przychodów rachunku. Uzgodniony wpis ręczny zachowuje swoją tożsamość; `raw.manualOriginal` pozwala przywrócić go przy wycofaniu importu.

`RecurringCharge` to plan. Dopiero osobne potwierdzenie tworzy lub wiąże rzeczywisty koszt (`ChargePayment`). Sama definicja nie zmienia finansów.

## Interfejs i PWA

Wybory i daty używają wspólnych komponentów. Preferencje widoków są zapisywane w `sessionStorage`; zapis danych zwiększa `dataRevision`, odświeżając analizy. Service worker buforuje zasoby aplikacji, nie dane finansowe. Importy analizowane są lokalnie przez backend, bez zewnętrznych API klasyfikacji.

## Strona i publiczne demo

`budget-app/site/` buduje niezależną stronę prezentacyjną. Publiczne demo korzysta z istniejących stron Vue i osobnego adaptera Axios (`src/household/demo/`), włączanego w czasie kompilacji. Model demonstracyjny operuje na fikcyjnych danych w localStorage i nie wykonuje żądań API. Nie jest zamiennikiem backendu ani implementacją bankowego parsera CSV. Import w demo jest jawnie oznaczoną symulacją.

Routing z `#` i wyłączony service worker zapewniają działanie na GitHub Pages pod ścieżką repozytorium. Oba buildy łączone są w statyczny `dist-pages/`. Build produkcyjny Docker nie używa trybu demo. Publikacja Pages jest niezależna od GHCR i własnych instalacji. Szczegóły w [pages.md](pages.md).
