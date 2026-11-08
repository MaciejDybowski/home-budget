import { merchantAliases, merchantKey } from './merchants.service';

describe('Merchant identity and learning', () => {
  it('normalizes casing, compatibility characters and spacing without removing Polish letters', () => {
    expect(merchantKey('  LIDL\u00a0  Kraków ')).toBe('lidl kraków');
    expect(merchantKey('Żabka')).not.toBe(merchantKey('Zabka'));
  });

  it('learns precise domains but not a generic payment processor', () => {
    expect(
      merchantAliases({
        title: 'Płatność https://www.mamabrum.eu/zamowienie',
        counterparty: 'PayPro S.A.',
      }),
    ).toEqual(['domain:mamabrum.eu']);
    expect(
      merchantAliases({
        title: 'Płatność payu.com',
        counterparty: 'PayU S.A.',
      }),
    ).toEqual([]);
    expect(
      merchantAliases({ title: 'Płatność', counterparty: 'PayPro S.A.' }),
    ).toEqual([]);
  });

  it('keeps exact recipient identities instead of matching an arbitrary description substring', () => {
    expect(
      merchantAliases({
        title: 'Płatność kartą 01.11.2026',
        counterparty: '  SKLEP  ALFA Kraków ',
      }),
    ).toEqual(['recipient:sklep alfa kraków']);
    expect(merchantAliases(null)).toEqual([]);
    expect(merchantAliases({ description: 'Alfa' })).toEqual([]);
  });
});
