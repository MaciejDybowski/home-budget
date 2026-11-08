import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import {
  accountNumber,
  dateOnly,
  kinds,
  Kind,
  meterUsage,
  money,
  normalize,
  parseIng,
  text,
  BankRow,
} from './domain';
import { recognize } from './domain';
import { RecurringService } from './recurring.service';
import { merchantKey, MerchantsService } from './merchants.service';

type Input = Record<string, any>;

@Injectable()
export class HouseholdService {
  constructor(
    private readonly db: PrismaService,
    private readonly recurring: RecurringService,
    private readonly merchants: MerchantsService,
  ) {}

  async state(month: string) {
    this.month(month);
    const start = dateOnly(`${month}-01`);
    const end = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1),
    );
    const previous = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1),
    );
    const yearStart = new Date(Date.UTC(start.getUTCFullYear(), 0, 1));
    const yearEnd = new Date(Date.UTC(start.getUTCFullYear() + 1, 0, 1));
    const [
      categories,
      sources,
      expenses,
      incomes,
      accounts,
      budget,
      goals,
      meters,
      imports,
      rules,
      previousExpenses,
      trend,
      recurring,
      merchants,
    ] = await Promise.all([
      this.db.category.findMany({
        include: { patterns: true },
        orderBy: { name: 'asc' },
      }),
      this.db.incomeSource.findMany({ orderBy: { name: 'asc' } }),
      this.db.expense.findMany({
        where: { date: { gte: start, lt: end } },
        include: {
          category: true,
          chargePayment: {
            include: { charge: { select: { id: true, name: true } } },
          },
        },
        orderBy: { date: 'desc' },
      }),
      this.db.income.findMany({
        where: { date: { gte: start, lt: end } },
        include: { source: true },
        orderBy: { date: 'desc' },
      }),
      this.db.bankAccount.findMany({ orderBy: { name: 'asc' } }),
      this.db.monthlyBudget.findUnique({ where: { month } }),
      this.db.savingsGoal.findMany({
        include: { contributions: { orderBy: { date: 'desc' } } },
        orderBy: { deadline: 'asc' },
      }),
      this.db.meterType.findMany({
        include: { readings: { orderBy: { date: 'asc' } } },
        orderBy: { name: 'asc' },
      }),
      this.db.importBatch.findMany({
        include: {
          _count: { select: { expenses: true, incomes: true } },
          account: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.db.merchantRule.findMany({ orderBy: { merchant: 'asc' } }),
      this.db.expense.findMany({
        where: { date: { gte: previous, lt: start } },
        include: { category: true },
      }),
      this.db.$queryRaw<{ month: string; spending: string; income: string }[]>`
        SELECT "month", SUM("spending")::text AS "spending", SUM("income")::text AS "income"
        FROM (
          SELECT TO_CHAR(e."date", 'YYYY-MM') AS "month",
            SUM(CASE WHEN e."kind" = 'REFUND' THEN -e."amount" ELSE e."amount" END) AS "spending", 0 AS "income"
          FROM "Expense" e JOIN "Category" c ON c."id" = e."categoryId"
          WHERE e."date" >= ${yearStart} AND e."date" < ${yearEnd}
            AND e."kind" IN ('EXPENSE','REFUND') AND NOT e."excludedFromBudget" AND NOT c."excludedFromBudget"
          GROUP BY TO_CHAR(e."date", 'YYYY-MM')
          UNION ALL
          SELECT TO_CHAR("date", 'YYYY-MM'), 0, SUM("amount") FROM "Income"
          WHERE "date" >= ${yearStart} AND "date" < ${yearEnd} GROUP BY TO_CHAR("date", 'YYYY-MM')
        ) totals GROUP BY "month" ORDER BY "month"
      `,
      this.recurring.overview(month),
      this.merchants.list(),
    ]);
    return {
      categories,
      sources,
      expenses,
      incomes,
      accounts,
      budget,
      goals,
      imports,
      rules,
      previousExpenses,
      trend,
      recurring,
      merchants,
      meters: meters.map((meter) => ({
        ...meter,
        intervals: meter.readings.slice(1).map((reading, index) => ({
          date: reading.date,
          ...meterUsage(meter.readings[index], reading),
        })),
      })),
    };
  }

  private month(value: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value))
      throw new BadRequestException('Nieprawidłowy miesiąc.');
  }

  private kind(value: unknown): Kind {
    if (!kinds.includes(value as Kind))
      throw new BadRequestException('Nieprawidłowy rodzaj operacji.');
    return value as Kind;
  }

  async saveExpense(input: Input, id?: string) {
    const kind = this.kind(input.kind ?? 'EXPENSE');
    const data = {
      amount: money(input.amount),
      date: dateOnly(input.date),
      categoryId: text(input.categoryId, 'kategoria'),
      description: String(input.description ?? '')
        .trim()
        .slice(0, 1000),
      merchant:
        String(input.merchant ?? '')
          .trim()
          .slice(0, 200) || null,
      kind,
      excludedFromBudget: input.excludedFromBudget === true,
    };
    if (
      !(await this.db.category.findUnique({ where: { id: data.categoryId } }))
    )
      throw new BadRequestException('Wybierz istniejącą kategorię.');
    return this.db.$transaction(async (tx) => {
      const merchant = await this.merchants.resolve(
        tx,
        input.merchantId,
        data.merchant,
      );
      if (id)
        await tx.$queryRaw`SELECT "id" FROM "Expense" WHERE "id" = ${id} FOR UPDATE`;
      if (
        id &&
        kind !== 'EXPENSE' &&
        (await tx.chargePayment.findUnique({ where: { expenseId: id } }))
      )
        throw new ConflictException(
          'Najpierw odłącz opłatę cykliczną przed zmianą rodzaju operacji.',
        );
      const original = id
        ? await tx.expense.findUnique({ where: { id } })
        : null;
      const expense = id
        ? await tx.expense.update({
            where: { id },
            data: { ...data, ...merchant },
          })
        : await tx.expense.create({
            data: { ...data, ...merchant, origin: 'MANUAL' },
          });
      if (original?.origin === 'BANK' && ['EXPENSE', 'REFUND'].includes(kind))
        await this.merchants.learn(
          tx,
          original.raw,
          merchant.merchantId,
          original.merchantId,
        );
      if (original?.origin === 'BANK') await this.merchants.prune(tx);
      if (input.chargeId)
        await this.recurring.link(
          tx,
          text(input.chargeId, 'opłata'),
          expense.id,
          input.dueDate,
        );
      return expense;
    });
  }

  async saveIncome(input: Input, id?: string) {
    const data = {
      amount: money(input.amount),
      date: dateOnly(input.date),
      sourceId: text(input.sourceId, 'źródło'),
      description: String(input.description ?? '').slice(0, 1000),
    };
    if (
      !(await this.db.incomeSource.findUnique({ where: { id: data.sourceId } }))
    )
      throw new BadRequestException('Wybierz istniejące źródło.');
    return id
      ? this.db.income.update({ where: { id }, data })
      : this.db.income.create({ data });
  }

  async saveCategory(input: Input, id?: string) {
    const data = {
      name: text(input.name, 'nazwa'),
      color: /^#[0-9a-f]{6}$/i.test(input.color) ? input.color : '#497B78',
      excludedFromBudget: input.excludedFromBudget === true,
    };
    const patterns = [
      ...new Set(
        String(input.patternsText ?? '')
          .split(/\r?\n/)
          .map((value) => value.trim())
          .filter(Boolean),
      ),
    ];
    if (
      patterns.length > 100 ||
      patterns.some((pattern) => pattern.length < 3 || pattern.length > 200)
    )
      throw new BadRequestException(
        'Podaj najwyżej 100 wzorców, po 3–200 znaków.',
      );
    return this.db.$transaction(async (tx) => {
      const category = id
        ? await tx.category.update({ where: { id }, data })
        : await tx.category.create({ data });
      if (input.patternsText !== undefined) {
        await tx.categoryPattern.deleteMany({
          where: { categoryId: category.id },
        });
        await tx.categoryPattern.createMany({
          data: patterns.map((pattern) => ({
            categoryId: category.id,
            pattern,
          })),
        });
      }
      return category;
    });
  }

  async saveSource(input: Input, id?: string) {
    const data = { name: text(input.name, 'nazwa'), color: '#497B78' };
    return id
      ? this.db.incomeSource.update({ where: { id }, data })
      : this.db.incomeSource.create({ data });
  }

  async saveAccount(input: Input, id?: string) {
    const data = {
      name: text(input.name, 'nazwa'),
      number: accountNumber(input.number),
    };
    return id
      ? this.db.bankAccount.update({ where: { id }, data })
      : this.db.bankAccount.create({ data });
  }

  async saveBudget(month: string, input: Input) {
    this.month(month);
    const categoryLimits: Record<string, string> = {};
    const categories = await this.db.category.findMany();
    for (const [key, value] of Object.entries(input.categoryLimits ?? {})) {
      if (!categories.some((category) => category.id === key))
        throw new BadRequestException('Nieznana kategoria limitu.');
      if (value !== '' && value != null)
        categoryLimits[key] = money(value, true);
    }
    const data = { amount: money(input.amount, true), categoryLimits };
    return this.db.monthlyBudget.upsert({
      where: { month },
      create: { month, ...data },
      update: data,
    });
  }

  async saveGoal(input: Input, id?: string) {
    const startDate = dateOnly(input.startDate);
    const deadline = dateOnly(input.deadline);
    if (deadline < startDate)
      throw new BadRequestException(
        'Termin celu musi przypadać po dacie rozpoczęcia.',
      );
    const data = {
      name: text(input.name, 'nazwa'),
      target: money(input.target),
      initialAmount: money(input.initialAmount ?? 0, true),
      startDate,
      deadline,
    };
    return id
      ? this.db.savingsGoal.update({ where: { id }, data })
      : this.db.savingsGoal.create({ data });
  }

  contribute(goalId: string, input: Input) {
    return this.db.goalContribution.create({
      data: { goalId, amount: money(input.amount), date: dateOnly(input.date) },
    });
  }

  async saveMeter(input: Input, id?: string) {
    const expectedMonthlyUsage =
      input.expectedMonthlyUsage === '' || input.expectedMonthlyUsage == null
        ? null
        : Number(input.expectedMonthlyUsage);
    if (
      expectedMonthlyUsage !== null &&
      (!Number.isFinite(expectedMonthlyUsage) || expectedMonthlyUsage < 0)
    )
      throw new BadRequestException('Nieprawidłowy limit licznika.');
    const data = {
      name: text(input.name, 'nazwa'),
      unit: text(input.unit, 'jednostka', 20),
      expectedMonthlyUsage,
    };
    return id
      ? this.db.meterType.update({ where: { id }, data })
      : this.db.meterType.create({ data });
  }

  async saveReading(input: Input, id?: string) {
    const meterTypeId = text(input.meterTypeId, 'licznik');
    const date = dateOnly(input.date);
    const value = Number(input.value);
    if (input.value === '' || !Number.isFinite(value) || value < 0)
      throw new BadRequestException('Nieprawidłowy stan licznika.');
    // Serialize concurrent edits to the same meter before validating adjacent readings.
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "MeterType" WHERE "id" = ${meterTypeId} FOR UPDATE`;
      const readings = await tx.meterReading.findMany({
        where: { meterTypeId, ...(id ? { id: { not: id } } : {}) },
        orderBy: { date: 'asc' },
      });
      if (readings.some((r) => r.date.getTime() === date.getTime()))
        throw new ConflictException('Ten licznik ma już odczyt w tym dniu.');
      const before = readings.filter((r) => r.date < date).at(-1);
      const after = readings.find((r) => r.date > date);
      if ((before && before.value > value) || (after && after.value < value))
        throw new BadRequestException(
          'Stan musi mieścić się między sąsiednimi odczytami.',
        );
      const data = { meterTypeId, date, value };
      return id
        ? tx.meterReading.update({ where: { id }, data })
        : tx.meterReading.create({ data });
    });
  }

  async saveRule(input: Input, id?: string) {
    const pattern = normalize(text(input.pattern, 'fragment opisu'));
    if (pattern.length < 3)
      throw new BadRequestException('Reguła wymaga co najmniej trzech znaków.');
    const categoryId = input.categoryId || null;
    if (
      categoryId &&
      !(await this.db.category.findUnique({ where: { id: categoryId } }))
    )
      throw new BadRequestException('Nieznana kategoria.');
    const data = {
      pattern,
      merchant: input.merchant ? text(input.merchant, 'sprzedawca') : '',
      categoryId,
      kind: this.kind(input.kind ?? 'EXPENSE'),
    };
    return this.db.$transaction(async (tx) => {
      const merchant = await this.merchants.resolve(
        tx,
        input.merchantId,
        data.merchant,
      );
      return id
        ? tx.merchantRule.update({
            where: { id },
            data: { ...data, ...merchant, merchant: merchant.merchant ?? '' },
          })
        : tx.merchantRule.create({
            data: { ...data, ...merchant, merchant: merchant.merchant ?? '' },
          });
    });
  }

  async preview(buffer: Buffer, accountId: string, parsedRows?: BankRow[]) {
    if (!(await this.db.bankAccount.findUnique({ where: { id: accountId } })))
      throw new BadRequestException('Wybierz konto źródłowe.');
    const rows = parsedRows ?? parseIng(buffer);
    if (!rows.length) return { legacyCount: 0, rows: [] };
    const learned = await this.merchants.suggestions(rows);
    const [accounts, rules, categories, existing, manual] = await Promise.all([
      this.db.bankAccount.findMany(),
      this.db.merchantRule.findMany(),
      this.db.category.findMany({ include: { patterns: true } }),
      Promise.all([
        this.db.expense.findMany({
          where: {
            accountId,
            externalId: { in: rows.map((row) => row.externalId) },
          },
          select: { externalId: true },
        }),
        this.db.income.findMany({
          where: {
            accountId,
            externalId: { in: rows.map((row) => row.externalId) },
          },
          select: { externalId: true },
        }),
      ]).then(([expenses, incomes]) => [...expenses, ...incomes]),
      this.db.expense.findMany({
        where: { origin: 'MANUAL', importId: null },
        select: {
          id: true,
          amount: true,
          date: true,
          merchant: true,
          description: true,
        },
      }),
    ]);
    rules.sort((a, b) => b.pattern.length - a.pattern.length);
    const dates = rows.map((row) => row.date).sort();
    const legacyCount = await this.db.expense.count({
      where: {
        origin: 'LEGACY',
        date: { gte: dateOnly(dates[0]), lte: dateOnly(dates.at(-1)) },
      },
    });
    return {
      legacyCount,
      rows: rows.map((row, index) => {
        const input = normalize(
          `${row.counterparty} ${row.title} ${row.details}`,
        );
        const rule = rules.find((rule) => input.includes(rule.pattern));
        const prior = learned.rows[index];
        const match = prior.merchant
          ? {
              merchant: prior.merchant.name,
              confidence: 'high',
              reason: 'Zapamiętany sklep',
            }
          : prior.ambiguous
            ? {
                merchant: '',
                confidence: 'low',
                reason: 'Dane pasują do kilku sklepów — wybierz sklep',
              }
            : recognize(row.counterparty, row.title);
        const catalogMerchant = learned.catalog.get(
          merchantKey(rule ? rule.merchant : match.merchant),
        );
        const matchedCategories = categories.filter((category) =>
          category.patterns.some((pattern) =>
            input.includes(normalize(pattern.pattern)),
          ),
        );
        const categoryId =
          rule?.categoryId ??
          (matchedCategories.length === 1 ? matchedCategories[0].id : null);
        const ownAccount = accounts.some(
          (account) =>
            account.number && account.number === row.counterpartyAccount,
        );
        const cash =
          input.includes('wymiana za gotowke') ||
          input.includes('wyplata z bankomatu');
        const loan = input.includes('nadplata kredytu');
        const ownTitle = input.includes('przelew wlasny');
        const kind = ownAccount
          ? 'TRANSFER'
          : (rule?.kind ??
            (cash ? 'TRANSFER' : loan ? 'LOAN_OVERPAYMENT' : 'EXPENSE'));
        return {
          ...row,
          ...match,
          merchantId: catalogMerchant?.id || null,
          ...(rule
            ? {
                merchant: rule.merchant,
                reason: 'Twoja reguła',
                confidence: 'high',
              }
            : {}),
          manualCandidates: manual.filter(
            (item) =>
              item.amount.equals(row.amount) &&
              Math.abs(item.date.getTime() - dateOnly(row.date).getTime()) <=
                3 * 86400000,
          ),
          categoryId,
          kind,
          skip: row.incoming,
          excludedFromBudget: false,
          reason: ownAccount
            ? 'Przelew na zapisany własny rachunek'
            : cash
              ? 'Przeniesienie do gotówki — sprawdź'
              : ownTitle
                ? 'Możliwy przelew własny — sprawdź konto'
                : rule
                  ? 'Twoja reguła'
                  : match.reason,
          confidence:
            ownTitle && !ownAccount ? 'low' : rule ? 'high' : match.confidence,
          duplicate: existing.some(
            (item) => item.externalId === row.externalId,
          ),
        };
      }),
    };
  }

  async import(
    buffer: Buffer,
    accountId: string,
    filename: string,
    input: Input,
  ) {
    const preview = await this.preview(buffer, accountId);
    if (preview.legacyCount && input.acknowledgeLegacy !== true)
      throw new ConflictException(
        'Okres obejmuje stare wydatki. Najpierw uzgodnij historię, aby nie podwoić sum.',
      );
    if (
      !Array.isArray(input.decisions) ||
      input.decisions.length !== preview.rows.length
    )
      throw new BadRequestException('Niekompletne decyzje importu.');
    const decisions = new Map<string, Input>(
      input.decisions.map((decision: Input) => [decision.externalId, decision]),
    );
    if (decisions.size !== preview.rows.length)
      throw new BadRequestException('Powtórzone decyzje importu.');
    const categories = await this.db.category.findMany();
    const selected = preview.rows.flatMap((row) => {
      const decision = decisions.get(row.externalId);
      if (!decision)
        throw new BadRequestException('Brakuje decyzji dla transakcji.');
      if (row.duplicate || decision.skip === true) return [];
      const kind = this.kind(decision.kind);
      if (row.incoming && kind !== 'REFUND' && kind !== 'TRANSFER')
        throw new BadRequestException(
          'Wpływ można oznaczyć jako zwrot lub przelew własny, albo pominąć.',
        );
      if (!row.incoming && kind === 'REFUND')
        throw new BadRequestException('Obciążenie nie jest zwrotem zakupu.');
      if (!categories.some((category) => category.id === decision.categoryId))
        throw new BadRequestException(
          'Każda zapisywana operacja wymaga kategorii.',
        );
      return [
        {
          manualMatchId: decision.manualMatchId
            ? text(decision.manualMatchId, 'wpis ręczny')
            : null,
          amount: row.amount,
          date: dateOnly(row.date),
          bookingDate: dateOnly(row.bookingDate),
          externalId: row.externalId,
          description: `${row.counterparty} | ${row.title}`,
          merchant: text(decision.merchant, 'sprzedawca'),
          kind,
          categoryId: decision.categoryId as string,
          excludedFromBudget: decision.excludedFromBudget === true,
          accountId,
          origin: 'BANK',
          raw: row as unknown as Prisma.InputJsonValue,
        },
      ];
    });
    if (!selected.length)
      throw new BadRequestException('Brak nowych operacji do zapisania.');
    const matchedIds = selected.map((row) => row.manualMatchId).filter(Boolean);
    if (new Set(matchedIds).size !== matchedIds.length)
      throw new BadRequestException(
        'Jeden wpis ręczny można dopasować tylko do jednej operacji bankowej.',
      );
    return this.db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "BankAccount" WHERE "id" = ${accountId} FOR UPDATE`;
        const batch = await tx.importBatch.create({
          data: { filename: filename.slice(0, 250), accountId },
        });
        let count = 0;
        for (const { manualMatchId, ...row } of selected) {
          if (
            (await tx.expense.findFirst({
              where: { accountId, externalId: row.externalId },
              select: { id: true },
            })) ||
            (await tx.income.findFirst({
              where: { accountId, externalId: row.externalId },
              select: { id: true },
            }))
          )
            continue;
          const merchant = await this.merchants.resolve(
            tx,
            undefined,
            row.merchant,
          );
          if (manualMatchId) {
            await tx.$queryRaw`SELECT "id" FROM "Expense" WHERE "id" = ${manualMatchId} FOR UPDATE`;
            const original = await tx.expense.findUnique({
              where: { id: manualMatchId },
            });
            if (
              !original ||
              original.origin !== 'MANUAL' ||
              original.importId ||
              !original.amount.equals(row.amount) ||
              Math.abs(original.date.getTime() - row.date.getTime()) >
                3 * 86400000
            )
              throw new ConflictException(
                'Wpis ręczny zmienił się lub nie pasuje do operacji. Ponownie sprawdź import.',
              );
            const snapshot = {
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
              where: { id: original.id },
              data: {
                ...row,
                ...merchant,
                importId: batch.id,
                raw: { ...(row.raw as object), manualOriginal: snapshot },
              },
            });
            count++;
          } else {
            const result = await tx.expense.createMany({
              data: [{ ...row, ...merchant, importId: batch.id }],
              skipDuplicates: true,
            });
            count += result.count;
          }
          if (['EXPENSE', 'REFUND'].includes(row.kind))
            await this.merchants.learn(tx, row.raw, merchant.merchantId);
        }
        return { id: batch.id, count };
      },
      { timeout: 60000 },
    );
  }

  async remove(entity: string, id: string) {
    switch (entity) {
      case 'merchants':
        return this.merchants.remove(id);
      case 'expenses':
        return this.db.$transaction(async (tx) => {
          const expense = await tx.expense.delete({ where: { id } });
          await this.merchants.prune(tx);
          return expense;
        });
      case 'incomes':
        return this.db.income.delete({ where: { id } });
      case 'contributions':
        return this.db.goalContribution.delete({ where: { id } });
      case 'goals':
        return this.db.savingsGoal.delete({ where: { id } });
      case 'readings':
        return this.db.meterReading.delete({ where: { id } });
      case 'rules':
        return this.db.merchantRule.delete({ where: { id } });
      case 'recurring':
        return this.db.recurringCharge.delete({ where: { id } });
      case 'payments':
        return this.db.chargePayment.delete({ where: { id } });
      case 'sources':
        return this.db.incomeSource.delete({ where: { id } });
      case 'accounts':
        return this.db.bankAccount.delete({ where: { id } });
      case 'meters':
        return this.db.meterType.delete({ where: { id } });
      case 'categories':
        return this.db.$transaction(async (tx) => {
          if (await tx.expense.count({ where: { categoryId: id } }))
            throw new ConflictException(
              'Kategoria ma transakcje. Najpierw je przenieś.',
            );
          await tx.categoryPattern.deleteMany({ where: { categoryId: id } });
          await tx.merchantRule.updateMany({
            where: { categoryId: id },
            data: { categoryId: null },
          });
          return tx.category.delete({ where: { id } });
        });
      case 'imports':
        return this.db.$transaction(
          async (tx) => {
            const matched = await tx.expense.findMany({
              where: { importId: id },
            });
            for (const expense of matched) {
              const original = (expense.raw as Input | null)?.manualOriginal as
                | Input
                | undefined;
              if (original) {
                const merchant = await this.merchants.resolve(
                  tx,
                  original.merchantId,
                  original.merchant,
                );
                if (original.kind !== 'EXPENSE')
                  await tx.chargePayment.deleteMany({
                    where: { expenseId: expense.id },
                  });
                await tx.expense.update({
                  where: { id: expense.id },
                  data: {
                    amount: original.amount,
                    date: new Date(original.date),
                    description: original.description,
                    ...merchant,
                    kind: original.kind,
                    categoryId: original.categoryId,
                    excludedFromBudget: original.excludedFromBudget,
                    origin: 'MANUAL',
                    importId: null,
                    raw: Prisma.DbNull,
                    externalId: null,
                    accountId: null,
                    bookingDate: null,
                  },
                });
              }
            }
            await tx.expense.deleteMany({ where: { importId: id } });
            await tx.income.deleteMany({ where: { importId: id } });
            await this.merchants.prune(tx);
            return tx.importBatch.delete({ where: { id } });
          },
          { timeout: 30000 },
        );
      default:
        throw new BadRequestException('Nieznany zasób.');
    }
  }
}
