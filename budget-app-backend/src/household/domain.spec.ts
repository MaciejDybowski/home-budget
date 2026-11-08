import {
  accountNumber,
  dateOnly,
  meterUsage,
  money,
  parseIng,
  recognize,
} from './domain';

const header =
  'Data transakcji;Data księgowania;Dane kontrahenta;Tytuł;Nr rachunku;Nazwa banku;Szczegóły;Nr transakcji;Kwota transakcji (waluta rachunku);Waluta;Kwota blokady/zwolnienie blokady;Waluta;Kwota płatności w walucie;Waluta';
const line = (id = '123', amount = '-4,30', date = '2.06.2026') =>
  `${date};4.06.2026;CITY-NAV;Płatność BLIK jakdojade.pl;;;TR.BLIK;'${id}';${amount};PLN;;;;`;
const csv = (...lines: string[]) =>
  Buffer.from([header, ...lines].join('\r\n'));

describe('ING import invariants', () => {
  it('preserves separate operations, booking date, Polish dates and exact amounts', () => {
    const rows = parseIng(csv(line('1'), line('2')));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      externalId: '1',
      amount: '4.30',
      date: '2026-06-02',
      bookingDate: '2026-06-04',
      incoming: false,
    });
  });
  it('does not discard rows without a counterparty', () => {
    expect(parseIng(csv(line().replace('CITY-NAV', '')))[0].counterparty).toBe(
      '',
    );
  });
  it('keeps incoming operations for explicit refund or transfer review', () => {
    expect(parseIng(csv(line('1', '12,50')))[0]).toMatchObject({
      amount: '12.50',
      incoming: true,
    });
  });
  it('skips only empty lines and known bank footer', () => {
    expect(
      parseIng(
        csv(
          line(),
          ';;;;;;;;;;;;;',
          'Dokument ma charakter informacyjny, nie stanowi dowodu księgowego;;;;;;;;;;;;;',
        ),
      ),
    ).toHaveLength(1);
    expect(() => parseIng(csv(line(), 'błędny wiersz'))).toThrow();
  });
  it('rejects duplicate transaction ids rather than silently merging', () => {
    expect(() => parseIng(csv(line(), line()))).toThrow();
  });
  it('rejects impossible dates, invalid money and non-PLN accounts', () => {
    expect(() => parseIng(csv(line('1', '-4,30', '31.02.2026')))).toThrow();
    expect(() => parseIng(csv(line('1', '-4,301')))).toThrow();
    expect(() => parseIng(csv(line().replace(';PLN;', ';EUR;')))).toThrow();
  });
  it('distinguishes merchant domains from payment processors', () => {
    expect(recognize('PayPro S.A.', 'Płatność intercity.pl').merchant).toBe(
      'PKP Intercity',
    );
    expect(recognize('PayPro S.A.', 'Płatność mamabrum.eu').merchant).toBe(
      'Mamabrum',
    );
    expect(recognize('TERG S.A.', 'www.mediaexpert.pl').merchant).toBe(
      'Media Expert',
    );
    expect(recognize('PayU', 'Płatność bez domeny').confidence).toBe('low');
  });
});

describe('Finance and meter validation', () => {
  it('does not round away fractions of cents', () => {
    expect(money('0,10')).toBe('0.10');
    expect(() => money('1.001')).toThrow();
    expect(() => money('-10')).toThrow();
    expect(() => money('0')).toThrow();
  });
  it('does not shift calendar dates with local timezone', () => {
    expect(dateOnly('2026-06-02').toISOString()).toBe(
      '2026-06-02T00:00:00.000Z',
    );
  });
  it('validates own account numbers', () => {
    expect(accountNumber('PL 61 1090 1014 0000 0712 1981 2874')).toBe(
      '61109010140000071219812874',
    );
    expect(() => accountNumber('61109010140000071219812875')).toThrow();
  });
  it('normalizes irregular meter intervals without claiming a calendar month', () => {
    const interval = meterUsage(
      { date: dateOnly('2026-01-01'), value: 10 },
      { date: dateOnly('2026-02-10'), value: 14 },
    );
    expect(interval?.days).toBe(40);
    expect(interval?.usage).toBe(4);
    expect(interval?.monthlyPace).toBeCloseTo(3.0436875);
    expect(
      meterUsage(
        { date: dateOnly('2026-01-01'), value: 14 },
        { date: dateOnly('2026-02-10'), value: 10 },
      ),
    ).toBeNull();
  });
});
