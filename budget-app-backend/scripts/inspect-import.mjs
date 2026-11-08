import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { parseIng, recognize } = require('../dist/household/domain.js');
const path = process.argv[2];
if (!path)
  throw new Error(
    'Podaj ścieżkę do CSV: npm run csv:inspect -- /ścieżka/plik.csv',
  );
const rows = parseIng(await readFile(path));
const recognized = rows.filter(
  (row) => recognize(row.counterparty, row.title).confidence === 'high',
);
console.log(
  JSON.stringify(
    {
      rows: rows.length,
      recognized: recognized.length,
      unknown: rows.length - recognized.length,
      incoming: rows.filter((row) => row.incoming).length,
      minDate: rows.map((row) => row.date).sort()[0],
      maxDate: rows
        .map((row) => row.date)
        .sort()
        .at(-1),
      exactAmountPLN: (
        rows.reduce(
          (sum, row) =>
            sum +
            Math.round(Number(row.amount) * 100) * (row.incoming ? -1 : 1),
          0,
        ) / 100
      ).toFixed(2),
    },
    null,
    2,
  ),
);
