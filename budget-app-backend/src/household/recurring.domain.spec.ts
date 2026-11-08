import { dateOnly } from './domain';
import {
  occurrenceAt,
  scheduledDates,
  validOccurrence,
} from './recurring.domain';

describe('Calendar billing schedules', () => {
  it('keeps the original day after a short month without drifting', () => {
    const anchor = dateOnly('2026-01-31');
    expect(occurrenceAt(anchor, 1).toISOString().slice(0, 10)).toBe(
      '2026-02-28',
    );
    expect(occurrenceAt(anchor, 2).toISOString().slice(0, 10)).toBe(
      '2026-03-31',
    );
  });
  it('clamps leap-day annual bills and restores the leap day four years later', () => {
    const anchor = dateOnly('2024-02-29');
    expect(occurrenceAt(anchor, 12).toISOString().slice(0, 10)).toBe(
      '2025-02-28',
    );
    expect(occurrenceAt(anchor, 48).toISOString().slice(0, 10)).toBe(
      '2028-02-29',
    );
  });
  it('does not invent earlier payments and skips inactive schedules', () => {
    const charge = {
      anchorDate: dateOnly('2026-06-15'),
      intervalMonths: 3,
      status: 'ACTIVE',
    };
    expect(
      scheduledDates(
        charge,
        dateOnly('2026-01-01'),
        dateOnly('2026-12-31'),
      ).map((date) => date.toISOString().slice(0, 10)),
    ).toEqual(['2026-06-15', '2026-09-15', '2026-12-15']);
    expect(
      scheduledDates(
        { ...charge, status: 'PAUSED' },
        dateOnly('2026-01-01'),
        dateOnly('2026-12-31'),
      ),
    ).toEqual([]);
  });
  it('validates exact billing dates, including dates before the anchor', () => {
    const charge = {
      anchorDate: dateOnly('2026-01-31'),
      intervalMonths: 1,
      status: 'ACTIVE',
    };
    expect(validOccurrence(charge, dateOnly('2026-02-28'))).toBe(true);
    expect(validOccurrence(charge, dateOnly('2026-02-27'))).toBe(false);
    expect(validOccurrence(charge, dateOnly('2025-12-31'))).toBe(false);
  });
});
