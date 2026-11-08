# Baza danych

Nowa instalacja uruchamia się z pustą bazą PostgreSQL. Nie potrzebujesz dumpa, starej aplikacji ani ręcznej migracji danych.

Podczas `docker compose up -d` jednorazowa usługa `migrate` automatycznie tworzy aktualny schemat przez Prisma. Backend uruchamia się dopiero po jej poprawnym zakończeniu. `Exited (0)` dla tej usługi oznacza sukces, nie awarię.

Historia w `prisma/migrations/` jest technicznym mechanizmem tworzenia i aktualizacji schematu. Pozwala tej samej wersji obrazu uruchomić nową bazę oraz bezpiecznie rozpoznać już zastosowane zmiany w istniejącej instalacji. Nie usuwaj tej historii i nie używaj `prisma db push` ani `migrate reset` do aktualizacji swoich finansów.

Przed aktualizacją wykonaj [backup](backups.md), zachowaj `.env` i `pgdata/`, pobierz obrazy i zatrzymaj zapisy. Następnie uruchom Compose — zastosuje tylko nowe zmiany schematu. Jeżeli inicjalizacja lub aktualizacja schematu się nie powiedzie, sprawdź `docker compose logs migrate` zamiast omijać ten krok.

Wycofanie wersji z innym schematem wymaga osobnej, zweryfikowanej kopii bazy. Nie nadpisuj bieżących danych. Konfiguracja i zwykłe aktualizacje: [deployment.md](deployment.md).
