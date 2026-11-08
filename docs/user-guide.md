# HomeBudget — instrukcja użytkownika

Wspólny budżet domowy jako PWA: Vue 3 + TypeScript, NestJS, Prisma i PostgreSQL.
Mobilny interfejs w stylu iOS, uniwersalny import CSV, wdrożenie przez Docker Compose.

## Funkcje

- Dashboard miesiąca, roczne porównanie przychodów i wydatków, zestawienia kategorii i sprzedawców.
- Ręczne wydatki i przychody z wielu źródeł. Jedna kategoria na operację.
- Łączny miesięczny limit i opcjonalne limity kategorii, bez przenoszenia na następny miesiąc.
- Nadpłaty kredytu osobno, przelewy własne i przeniesienia do gotówki poza wydatkami.
- Cele oszczędnościowe, kwota początkowa, termin i potwierdzenia faktycznie odłożonych środków.
- Liczniki z historią, miesięcznymi założeniami i tempem zużycia dla nieregularnych odstępów odczytów.
- Import CSV z mapowaniem kolumn, podpowiedziami dla ING i popularnych nagłówków oraz szablonami zapisywanymi osobno dla każdego rachunku.
- Import wydatków i przychodów w PLN, oryginalne dane, daty transakcji i księgowania, marki i domeny, własne reguły, wykrywanie duplikatów oraz ręczne uzgadnianie wcześniejszych wydatków.
- Historia i wycofanie całych importów, obejmujące zarówno wydatki, jak i przychody. Błędne wiersze można jawnie pominąć.
- Jasny/ciemny wygląd, instalacja na iPhone, bez zewnętrznych fontów i CDN.
- Wybrany miesiąc, zakładki i filtry widoków są zapamiętywane w bieżącej karcie przeglądarki, również po odświeżeniu strony. Miesiąc jest wspólny dla widoków aplikacji.
- Kompaktowy formularz wydatku: kwota, kategoria, dwuwierszowy opis, data i wyszukiwany sklep. Rodzaj operacji i wyłączenie z limitu są w dodatkowych ustawieniach.
- Wspólny katalog sklepów ze wszystkich miesięcy, dodawanie nowego sklepu przy wydatku i zarządzanie nazwami w „Więcej”. Korekta nazwy sklepu aktualizuje wszystkie przypisane transakcje i statystyki.
- Usuwanie sklepu pozostawia operacje bez przypisania. Scalanie przenosi operacje, reguły i zapamiętane dopasowania do wybranego sklepu docelowego, również w historii wycofywania importów.
- Analizy z wykresami słupkowymi, liniowymi, pierścieniowymi i rankingiem sklepów; filtry miesiąca, kwartału, roku oraz własnego zakresu i przejście do transakcji.
- Szczegóły kategorii: suma netto, wykres i lista transakcji obok (na telefonie pod wykresem), bezpośrednia edycja oraz jawny wybór kwartału i roku. Domyślnie obejmują także wydatki poza limitem budżetu.
- Subskrypcje i stałe opłaty w PLN: osobne oraz wspólne ekwiwalenty miesięczne/roczne, harmonogram i potwierdzane powiązania z istniejącymi wydatkami. Sama definicja opłaty nie zmienia budżetu.

## Uniwersalny import CSV

W „Import” wybierz rachunek i plik, kliknij „Odczytaj kolumny”, sprawdź przypisanie pól oraz przykładowe wartości, a następnie „Sprawdź operacje”. Samo wgranie pliku i podgląd niczego nie zapisują do historii finansowej.

- Separatory: średnik, przecinek, tabulator i `|`. Kodowanie UTF-8, Windows-1250 i Windows-1252. Cudzysłowy i opisy wielowierszowe są obsługiwane. Limit: 5 MB, 5000 operacji, 100 kolumn.
- Można zmienić pierwszy niepusty rekord tabeli i wskazać plik bez nagłówków. Po zmianie ustawień odczytu kliknij „Odczytaj ponownie”.
- Wymagane są data, opis lub kontrahent oraz kwota. Opcjonalne: data księgowania, ID, waluta, numer rachunku kontrahenta i dodatkowy opis. Bez kolumny waluty przyjmujemy PLN; inne waluty zgłaszamy jako błędy, bez automatycznego przeliczania.
- Kwoty: ze znakiem, osobne obciążenie/uznanie, kwota i kierunek ze zdefiniowanymi wartościami albo cały plik jako wydatki/przychody. Format daty i separator groszy wybiera użytkownik; daty z ukośnikiem wymagają sprawdzenia konwencji dzień/miesiąc.
- Każdy przychód wymaga źródła. Można przypisać je zbiorczo. Wpływ można też oznaczyć jako zwrot lub przelew własny. Własne rachunki i dotychczasowe reguły nadal pomagają klasyfikować operacje.
- Rozpoznane przelewy własne i przeniesienia do gotówki są domyślnie pomijane. Można je jawnie włączyć do importu. Zmiana rodzaju operacji na przelew własny również zaznacza pominięcie.
- Wybór kategorii uzupełnia pozostałe nieprzypisane, niepominięte operacje tego samego odbiorcy i rodzaju w bieżącym pliku, także poza widoczną stroną. Wcześniejsze przypisania i duplikaty pozostają bez zmian; każdą kategorię można poprawić osobno. Nierozpoznane płatności przez pośredników nie są grupowane wyłącznie po nazwie operatora.
- „Sklep / odbiorca” to nazwa do grupowania sklepów w statystykach. Można ją zmienić przed importem lub później w edycji wpisu na stronie „Transakcje”.
- Sklep wybiera się z globalnego katalogu lub dodaje z wyszukiwarki. Potwierdzone przypisania uczą następne importy po dokładnej nazwie odbiorcy lub domenie sklepu. Reguły użytkownika mają pierwszeństwo; ogólne nazwy operatorów płatności nie są zapamiętywane jako identyfikator sklepu. Sprzeczne dopasowania wymagają wyboru sklepu. Wycofanie importu usuwa dopasowania, które nie mają już poparcia w zapisanych operacjach.
- Szablon zawiera mapowanie i ustawienia odczytu. Podaj nazwę i kliknij „Zapisz / zaktualizuj szablon”; ta sama nazwa na tym samym koncie aktualizuje istniejący szablon. Zgodne nagłówki sugerują zapisany szablon, a zmieniony układ wymaga ponownego dopasowania.
- Bankowe ID są sprawdzane wspólnie w wydatkach i przychodach danego konta. Bez ID używamy skrótu znormalizowanych danych oraz numeru wystąpienia identycznej operacji w pliku: dwa identyczne zakupy pozostają osobne. Ponowne lub częściowo pokrywające się eksporty mogą być niejednoznaczne; podobny wpis można świadomie dopuścić jako osobną operację.
- Błędy poszczególnych rekordów są widoczne z numerem rekordu i danymi. Zapis poprawnych wymaga potwierdzenia pominięcia błędnych. Uszkodzona struktura cudzysłowów blokuje odczyt całego pliku.

„Więcej” → historia importów pozwala wycofać partię. Usuwa jej wydatki i przychody, a wydatki połączone z wcześniejszym wpisem ręcznym przywraca do stanu sprzed importu.

## Subskrypcje i stałe opłaty

Panel jest dostępny ze Startu i „Więcej”. Wpisz nazwę, kwotę, cykl w miesiącach (1 / 3 / 12 lub inny), pierwszy znany termin oraz opcjonalny fragment opisu bankowego.
Plan nie tworzy kosztów. Po imporcie wybierz „Powiąż wydatek” i potwierdź istniejącą operację. „Dodaj koszt” jest osobną, świadomą akcją: tworzy ręczny wydatek i powiązanie w jednej transakcji.
Jeden wydatek może być powiązany tylko raz, a jeden termin opłaty ma najwyżej jedno powiązanie. Usunięcie definicji lub powiązania nie usuwa wydatku.

Ekwiwalent miesięczny = kwota / liczba miesięcy cyklu, roczny = kwota × 12 / liczba miesięcy cyklu. Sumy liczymy przed zaokrągleniem do groszy.
To inne wartości niż suma faktycznych terminów w wybranym miesiącu lub roku. Harmonogram zaczyna się od pierwszej zapisanej daty; dla płatności 31. dnia krótkie miesiące używają ostatniego dnia, bez przesuwania kolejnych terminów.
Wstrzymane i zakończone definicje nie wchodzą do prognozy. Zmienna kwota rachunku może być szacunkiem — powiązanie zachowuje faktyczny koszt z wydatku i nie zmienia automatycznie planowanej ceny.

## Instalacja i dane

Nową instalację rozpoczynasz z pustą bazą. Jej schemat jest tworzony automatycznie. Kategorie, rachunki i źródła przychodów dodasz w „Więcej”.

Instalacja i aktualizacje: [deployment.md](deployment.md). Kopie danych: [backups.md](backups.md). Rozwój i testy: [development.md](development.md).

Rozpoznawanie sprzedawców działa lokalnie na domenach, aliasach, wzorcach kategorii i własnych regułach. Nie wysyła wyciągów do zewnętrznych API i nie zgaduje produktów na podstawie samej platformy Allegro czy operatora płatności.
