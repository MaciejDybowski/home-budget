import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma.service';
import { HouseholdService } from './household.service';
import { dateOnly, text } from './domain';
import { inspectCsv, parseCsv, validateCsvConfig } from './csv.domain';
import { MerchantsService } from './merchants.service';

type Input = Record<string, unknown>;

@Injectable()
export class CsvImportService {
  constructor(
    private readonly db: PrismaService,
    private readonly household: HouseholdService,
    private readonly merchants: MerchantsService,
  ) {}

  async templates(accountId: string) {
    await this.account(accountId);
    return this.db.csvImportTemplate.findMany({
      where: { accountId },
      orderBy: { name: 'asc' },
    });
  }

  async saveTemplate(accountId: string, input: Input) {
    await this.account(accountId);
    const name = text(input.name, 'nazwa szablonu', 100);
    const config = validateCsvConfig(
      input.config,
    ) as unknown as Prisma.InputJsonValue;
    return this.db.csvImportTemplate.upsert({
      where: { accountId_name: { accountId, name } },
      create: { accountId, name, config },
      update: { config },
    });
  }

  async deleteTemplate(accountId: string, id: string) {
    await this.account(accountId);
    return this.db.csvImportTemplate.deleteMany({ where: { id, accountId } });
  }

  async inspect(buffer: Buffer, accountId: string, settings?: Input) {
    await this.account(accountId);
    return inspectCsv(buffer, settings);
  }

  async preview(buffer: Buffer, accountId: string, config: unknown) {
    const parsed = parseCsv(buffer, config);
    const preview = await this.household.preview(
      buffer,
      accountId,
      parsed.rows,
    );
    const incomingDates = parsed.rows
      .filter((row) => row.incoming)
      .map((row) => row.date)
      .sort();
    const priorIncomes = incomingDates.length
      ? await this.db.income.count({
          where: {
            externalId: null,
            date: {
              gte: dateOnly(incomingDates[0]),
              lte: dateOnly(incomingDates.at(-1)),
            },
          },
        })
      : 0;
    return {
      ...preview,
      legacyCount: preview.legacyCount + priorIncomes,
      errors: parsed.errors,
      rows: preview.rows.map((row, index) => ({
        ...row,
        rowNumber: parsed.rows[index].rowNumber,
        syntheticId: parsed.rows[index].syntheticId,
        merchant:
          row.reason === 'Dane pasują do kilku sklepów — wybierz sklep'
            ? ''
            : (row.merchant || row.title).slice(0, 200),
        kind:
          row.incoming && !['TRANSFER', 'REFUND'].includes(row.kind)
            ? 'INCOME'
            : row.kind,
        skip: row.kind === 'TRANSFER',
        sourceId: null,
        manualCandidates:
          row.incoming && !['TRANSFER', 'REFUND'].includes(row.kind)
            ? []
            : row.manualCandidates,
        duplicate: row.duplicate,
      })),
    };
  }

  async commit(
    buffer: Buffer,
    accountId: string,
    filename: string,
    input: Input,
  ) {
    // Reparse on the server: amounts, dates and identities never come from UI decisions.
    const parsed = parseCsv(buffer, input.config);
    await this.account(accountId);
    if (parsed.errors.length && input.skipInvalid !== true)
      throw new BadRequestException('Potwierdź pominięcie błędnych wierszy.');
    if (
      !Array.isArray(input.decisions) ||
      input.decisions.length !== parsed.rows.length
    )
      throw new BadRequestException('Niekompletne decyzje importu.');
    const decisions = new Map<string, Input>();
    for (const value of input.decisions as unknown[]) {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new BadRequestException('Nieprawidłowe decyzje.');
      const decision = value as Input;
      if (
        typeof decision.externalId !== 'string' ||
        decisions.has(decision.externalId)
      )
        throw new BadRequestException('Nieprawidłowe lub powtórzone decyzje.');
      decisions.set(decision.externalId, decision);
    }
    const [categories, sources] = await Promise.all([
      this.db.category.findMany(),
      this.db.incomeSource.findMany(),
    ]);
    const selected = parsed.rows.flatMap((row) => {
      const d = decisions.get(row.externalId);
      if (!d) throw new BadRequestException('Brakuje decyzji dla wiersza.');
      if (d.skip === true) return [];
      if (
        typeof d.kind !== 'string' ||
        ![
          'EXPENSE',
          'INCOME',
          'REFUND',
          'TRANSFER',
          'LOAN_OVERPAYMENT',
        ].includes(d.kind) ||
        (row.incoming && !['INCOME', 'REFUND', 'TRANSFER'].includes(d.kind)) ||
        (!row.incoming && ['INCOME', 'REFUND'].includes(d.kind))
      )
        throw new BadRequestException(
          'Rodzaj operacji nie pasuje do kierunku kwoty.',
        );
      if (
        d.kind === 'INCOME'
          ? !sources.some((s) => s.id === d.sourceId)
          : !categories.some((c) => c.id === d.categoryId)
      )
        throw new BadRequestException(
          'Wybierz źródło przychodu lub kategorię wydatku.',
        );
      if (d.allowDuplicate && !row.syntheticId)
        throw new BadRequestException(
          'Nie można powtórzyć operacji z identyfikatorem bankowym.',
        );
      if (d.manualMatchId && d.kind === 'INCOME')
        throw new BadRequestException(
          'Nie można połączyć przychodu z wydatkiem ręcznym.',
        );
      return [{ row, d, merchant: text(d.merchant, 'nazwa operacji') }];
    });
    if (!selected.length)
      throw new BadRequestException('Brak operacji do zapisania.');
    const manualIds = selected.map((s) => s.d.manualMatchId).filter(Boolean);
    if (new Set(manualIds).size !== manualIds.length)
      throw new BadRequestException(
        'Wpis ręczny może być połączony tylko raz.',
      );
    return this.db.$transaction(
      async (tx) => {
        // Serialize imports for the same account, including expense ↔ income changes.
        await tx.$queryRaw`SELECT "id" FROM "BankAccount" WHERE "id" = ${accountId} FOR UPDATE`;
        const dates = parsed.rows.map((r) => r.date).sort();
        const legacyCount = dates.length
          ? await tx.expense.count({
              where: {
                origin: 'LEGACY',
                date: { gte: dateOnly(dates[0]), lte: dateOnly(dates.at(-1)) },
              },
            })
          : 0;
        const incomingDates = parsed.rows
          .filter((row) => row.incoming)
          .map((row) => row.date)
          .sort();
        const priorIncomes = incomingDates.length
          ? await tx.income.count({
              where: {
                externalId: null,
                date: {
                  gte: dateOnly(incomingDates[0]),
                  lte: dateOnly(incomingDates.at(-1)),
                },
              },
            })
          : 0;
        if ((legacyCount || priorIncomes) && input.acknowledgeLegacy !== true)
          throw new ConflictException(
            'Najpierw uzgodnij starą historię z tego okresu.',
          );
        const ids = selected.map((s) => s.row.externalId);
        const [expenses, incomes] = await Promise.all([
          tx.expense.findMany({
            where: { accountId, externalId: { in: ids } },
            select: { externalId: true },
          }),
          tx.income.findMany({
            where: { accountId, externalId: { in: ids } },
            select: { externalId: true },
          }),
        ]);
        const existing = new Set(
          [...expenses, ...incomes].map((r) => r.externalId),
        );
        const batch = await tx.importBatch.create({
          data: { accountId, filename: filename.slice(0, 250) },
        });
        let count = 0;
        for (const { row, d, merchant } of selected) {
          if (
            existing.has(row.externalId) &&
            !(row.syntheticId && d.allowDuplicate === true)
          )
            continue;
          const externalId = existing.has(row.externalId)
            ? `${row.externalId}:copy:${randomUUID()}`
            : row.externalId;
          const common = {
            amount: row.amount,
            date: dateOnly(row.date),
            description: [row.counterparty, row.title]
              .filter(Boolean)
              .join(' | '),
            accountId,
            externalId,
            importId: batch.id,
            raw: row as unknown as Prisma.InputJsonValue,
          };
          if (d.kind === 'INCOME') {
            await tx.income.create({
              data: { ...common, sourceId: d.sourceId as string },
            });
          } else {
            const store = await this.merchants.resolve(
              tx,
              d.merchantId,
              merchant,
            );
            const data = {
              ...common,
              bookingDate: dateOnly(row.bookingDate),
              ...store,
              kind: d.kind as string,
              categoryId: d.categoryId as string,
              excludedFromBudget: d.excludedFromBudget === true,
              origin: 'BANK',
            };
            if (d.manualMatchId) {
              const id = text(d.manualMatchId, 'wpis ręczny');
              await tx.$queryRaw`SELECT "id" FROM "Expense" WHERE "id" = ${id} FOR UPDATE`;
              const original = await tx.expense.findUnique({
                where: { id },
                include: { chargePayment: true },
              });
              if (
                !original ||
                original.origin !== 'MANUAL' ||
                original.importId ||
                !original.amount.equals(row.amount) ||
                Math.abs(
                  original.date.getTime() - dateOnly(row.date).getTime(),
                ) >
                  3 * 86400000
              )
                throw new ConflictException(
                  'Wpis ręczny zmienił się lub nie pasuje. Ponownie sprawdź import.',
                );
              if (original.chargePayment && d.kind !== 'EXPENSE')
                throw new ConflictException(
                  'Ten wpis jest powiązany z opłatą. Najpierw usuń powiązanie albo pozostaw rodzaj Wydatek.',
                );
              const manualOriginal = {
                date: original.date.toISOString(),
                amount: original.amount.toString(),
                description: original.description,
                merchant: original.merchant,
                merchantId: original.merchantId,
                kind: original.kind,
                categoryId: original.categoryId,
                excludedFromBudget: original.excludedFromBudget,
              };
              await tx.expense.update({
                where: { id },
                data: {
                  ...data,
                  raw: {
                    ...row,
                    manualOriginal,
                  } as unknown as Prisma.InputJsonValue,
                },
              });
            } else await tx.expense.create({ data });
            if (['EXPENSE', 'REFUND'].includes(d.kind as string))
              await this.merchants.learn(tx, row, store.merchantId);
          }
          count++;
        }
        if (!count) {
          await tx.importBatch.delete({ where: { id: batch.id } });
        }
        return {
          id: count ? batch.id : null,
          count,
          skippedInvalid: parsed.errors.length,
        };
      },
      { timeout: 60000 },
    );
  }

  private async account(accountId: string) {
    if (
      !accountId ||
      !(await this.db.bankAccount.findUnique({ where: { id: accountId } }))
    )
      throw new BadRequestException('Wybierz konto źródłowe.');
  }
}
