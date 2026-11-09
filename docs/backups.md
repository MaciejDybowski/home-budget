# Backup i odtwarzanie

Wszystkie finanse są w PostgreSQL. Pliki `.env` oraz katalog `pgdata/` należą do danej instalacji i nie powinny trafiać do repozytorium. Publiczny instalator nie konfiguruje automatycznych backupów — harmonogram i docelowe miejsce kopii ustala właściciel instalacji.

## Kopia logiczna

Z katalogu aplikacji (przykłady dla domyślnych nazw bazy i użytkownika):

```sh
mkdir -p backups
docker compose exec -T postgres pg_dump -U postgres -d budgetdb -Fc > backups/homebudget.dump
docker compose exec -T postgres pg_restore --list < backups/homebudget.dump
```

Sprawdź kod zakończenia `pg_dump` i czytelność pliku przed uznaniem kopii za poprawną. Dla kolejnych kopii używaj osobnych nazw z datą. Przechowuj kopie również poza dyskiem hosta aplikacji. `.env` zabezpiecz oddzielnie; dump zawiera prywatne dane finansowe.

## Próbne odtworzenie

Odtwarzaj najpierw do osobnej bazy. Nie nadpisuj jedynej działającej instancji:

```sh
docker compose exec -T postgres createdb -U postgres budget_restore_check
docker compose exec -T postgres pg_restore -U postgres -d budget_restore_check --no-owner --no-acl --exit-on-error < backups/homebudget.dump
docker compose exec -T postgres psql -U postgres -d budget_restore_check -c 'SELECT count(*) FROM "Expense";'
```

Sprawdź również przychody, migracje i istotne zestawienia. Po zakończeniu możesz usunąć wyłącznie utworzoną do testu bazę `budget_restore_check`.

Od 2026.11.1 kopia zawiera także techniczne sesje logowania. Po odtworzeniu
produkcyjnym unieważnij wcześniejsze sesje (np. administracyjnym resetem hasła),
żeby odtworzenie backupu nie przywróciło sesji wylogowanych po wykonaniu kopii.
Login i hash są w technicznej tabeli `AuthAccount`, również objętej kopią bazy.

Odzyskiwanie produkcji wymaga zatrzymania zapisów i świadomego przełączenia aplikacji na zweryfikowane dane. Zachowaj dotychczasową bazę do czasu uzgodnienia stanu. Przeczytaj także [database.md](database.md).
