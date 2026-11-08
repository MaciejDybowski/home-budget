import { inspectCsv, parseCsv, validateCsvConfig } from './csv.domain';

const file = (text: string) => Buffer.from(text);
const read = (text: string) => {
  const buffer = file(text);
  return parseCsv(buffer, inspectCsv(buffer).config);
};

describe('Universal CSV parsing', () => {
  it('maps ING without losing bank identities, repeated currency columns or booking dates', () => {
    const buffer = file(
      "Data transakcji;Data księgowania;Dane kontrahenta;Tytuł;Nr rachunku;Nazwa banku;Szczegóły;Nr transakcji;Kwota transakcji (waluta rachunku);Waluta;Kwota blokady/zwolnienie blokady;Waluta;Kwota płatności w walucie;Waluta\n2.06.2026;4.06.2026;CITY-NAV;Płatność BLIK jakdojade.pl;;;TR.BLIK;'123';-4,30;PLN;;;;",
    );
    const inspected = inspectCsv(buffer);
    expect(inspected.config.columns.currency).toBe(9);
    const result = parseCsv(buffer, inspected.config);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      externalId: '123',
      date: '2026-06-02',
      bookingDate: '2026-06-04',
      amount: '4.30',
      incoming: false,
    });
  });

  it('supports quoted multiline descriptions, comma CSV and exact US money', () => {
    const result = read(
      'Date,Description,Amount,ID\n2026-11-05,"Groceries,\nweekly shopping","-1,234.56",a\n2026-11-06,Salary,5000.01,b',
    );
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      amount: '1234.56',
      incoming: false,
      title: 'Groceries,\nweekly shopping',
    });
    expect(result.rows[1].incoming).toBe(true);
  });

  it('handles separate debit/credit columns and rejects ambiguous direction', () => {
    const result = read(
      'Data;Opis;Obciążenie;Uznanie\n05.11.2026;Zakup;12,40;0,00\n05.11.2026;Pensja;;4000,00\n05.11.2026;Błąd;12,40;10,00',
    );
    expect(result.rows.map((r) => [r.amount, r.incoming])).toEqual([
      ['12.40', false],
      ['4000.00', true],
    ]);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].rowNumber).toBe(4);
  });

  it('allows headerless files with explicit column mapping and date convention', () => {
    const buffer = file(
      '11/05/2026|Transfer|1.200,10\n12/05/2026|Transfer|2.000,00',
    );
    const config = {
      ...inspectCsv(buffer).config,
      dateFormat: 'MM/DD/YYYY',
      decimal: ',',
      mode: 'expense',
      columns: { date: 0, title: 1, amount: 2 },
    };
    expect(config.hasHeader).toBe(false);
    const result = parseCsv(buffer, config);
    expect(result.errors).toEqual([]);
    expect(result.rows[0]).toMatchObject({
      date: '2026-11-05',
      amount: '1200.10',
      incoming: false,
    });
  });

  it('preserves two identical legitimate operations and stable identities when rows reorder', () => {
    const a = read(
      'Data;Opis;Kwota\n05.11.2026;Kawa;-10,00\n05.11.2026;Kawa;-10,00\n04.11.2026;Sklep;-20,00',
    );
    const b = read(
      'Data;Opis;Kwota\n04.11.2026;Sklep;-20,00\n05.11.2026;Kawa;-10,00\n05.11.2026;Kawa;-10,00',
    );
    expect(new Set(a.rows.map((r) => r.externalId)).size).toBe(3);
    expect(a.rows.map((r) => r.externalId).sort()).toEqual(
      b.rows.map((r) => r.externalId).sort(),
    );
    expect(a.rows.every((r) => r.syntheticId)).toBe(true);
  });

  it('reports bad rows without rounding cents or normalizing impossible dates', () => {
    const result = read(
      'Data;Opis;Kwota;Waluta;ID\n29.02.2024;OK;-1,01;PLN;1\n31.02.2026;Data;-1,01;PLN;2\n05.11.2026;Grosze;-1,001;PLN;3\n05.11.2026;Waluta;-1,01;EUR;4\n05.11.2026;Duplikat;-1,01;PLN;1\n05.11.2026;Brak ID;-1,01;PLN;',
    );
    expect(result.rows).toHaveLength(1);
    expect(result.errors.map((e) => e.rowNumber)).toEqual([3, 4, 5, 6, 7]);
  });

  it('supports custom direction labels, opposite signs and parenthesized negatives', () => {
    const buffer = file(
      'Data;Opis;Kwota;Kierunek\n05.11.2026;A;10,00;WY\n05.11.2026;B;20,00;WP\n05.11.2026;C;20,00;?',
    );
    const config = {
      ...inspectCsv(buffer).config,
      debitValues: 'WY',
      creditValues: 'WP',
    };
    const result = parseCsv(buffer, config);
    expect(result.rows.map((r) => r.incoming)).toEqual([false, true]);
    expect(result.errors).toHaveLength(1);
    const signed = file(
      'Data;Opis;Kwota\n05.11.2026;A;(10,00)\n05.11.2026;B;20,00',
    );
    const opposite = parseCsv(signed, {
      ...inspectCsv(signed).config,
      negativeIsExpense: false,
    });
    expect(opposite.rows.map((r) => r.incoming)).toEqual([true, false]);
  });

  it('detects Windows-1250 and headers after a bank preamble', () => {
    const buffer = Buffer.concat([
      file('Wyciag bankowy\nNumer rachunku: 123\nData;Opis;Kwota\n05.11.2026;'),
      Buffer.from([0xaf, 0xf3, 0xb3, 0xe6]),
      file(';-10,00'),
    ]);
    const inspected = inspectCsv(buffer);
    expect(inspected.config.encoding).toBe('windows-1250');
    expect(inspected.config.headerRow).toBe(2);
    expect(parseCsv(buffer, inspected.config).rows[0].title).toBe('Żółć');
  });

  it('rejects stale templates, overlapping mappings and broken quoting', () => {
    const buffer = file('Data;Opis;Kwota\n05.11.2026;A;-10,00');
    const config = inspectCsv(buffer).config;
    expect(() =>
      parseCsv(file('Opis;Data;Kwota\nA;05.11.2026;-10,00'), config),
    ).toThrow('Układ kolumn');
    expect(() =>
      validateCsvConfig({
        ...config,
        columns: { date: 0, title: 1, amount: 1 },
      }),
    ).toThrow('Jedną kolumnę');
    expect(() =>
      inspectCsv(file('Data;Opis;Kwota\n05.11.2026;"niedomkniety;-10,00')),
    ).toThrow();
  });
});
