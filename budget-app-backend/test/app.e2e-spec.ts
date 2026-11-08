import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { HouseholdModule } from '../src/household/household.module';
import { PrismaService } from '../src/prisma.service';
import { DatabaseErrorsFilter } from '../src/errors.filter';
import { inspectCsv } from '../src/household/csv.domain';

const url = process.env.TEST_DATABASE_URL;
const integration = url ? describe : describe.skip;
const header =
  'Data transakcji;Data księgowania;Dane kontrahenta;Tytuł;Nr rachunku;Nazwa banku;Szczegóły;Nr transakcji;Kwota transakcji (waluta rachunku);Waluta;Kwota blokady/zwolnienie blokady;Waluta;Kwota płatności w walucie;Waluta';
const csv = Buffer.from(
  `${header}\n2.06.2026;4.06.2026;CITY-NAV;jakdojade.pl;;;TR.BLIK;'bank-1';-4,30;PLN;;;;\n2.06.2026;4.06.2026;CITY-NAV;jakdojade.pl;;;TR.BLIK;'bank-2';-4,30;PLN;;;;`,
);

integration('Household API with an isolated PostgreSQL database', () => {
  let app: INestApplication;
  let db: PrismaService;
  let categoryId: string;
  let sourceId: string;
  let accountId: string;
  let manualId: string;
  let batchId: string;

  beforeAll(async () => {
    if (!url || !/\/(budget_integration|budget_test)(\?|$)/.test(url))
      throw new Error(
        'TEST_DATABASE_URL must point to budget_integration or budget_test.',
      );
    process.env.DATABASE_URL = url;
    const module = await Test.createTestingModule({
      imports: [HouseholdModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalFilters(new DatabaseErrorsFilter());
    await app.init();
    db = app.get(PrismaService);
    // Only the explicitly named disposable test database is cleared.
    await db.chargePayment.deleteMany();
    await db.recurringCharge.deleteMany();
    await db.goalContribution.deleteMany();
    await db.savingsGoal.deleteMany();
    await db.expense.deleteMany();
    await db.income.deleteMany();
    await db.importBatch.deleteMany();
    await db.categoryPattern.deleteMany();
    await db.category.deleteMany();
    await db.incomeSource.deleteMany();
    await db.bankAccount.deleteMany();
    await db.merchantRule.deleteMany();
    await db.merchantAlias.deleteMany();
    await db.merchant.deleteMany();
    await db.monthlyBudget.deleteMany();
    await db.meterReading.deleteMany();
    await db.meterType.deleteMany();
    categoryId = (await db.category.create({ data: { name: 'Transport' } })).id;
    sourceId = (
      await db.incomeSource.create({ data: { name: 'Wynagrodzenie' } })
    ).id;
    accountId = (await db.bankAccount.create({ data: { name: 'Test ING' } }))
      .id;
  });
  afterAll(async () => {
    await app?.close();
  });
  const api = () => request(app.getHttpServer());
  const decisions = (match = false) => ({
    decisions: ['bank-1', 'bank-2'].map((externalId, index) => ({
      externalId,
      merchant: 'Jakdojade',
      kind: 'EXPENSE',
      categoryId,
      skip: false,
      manualMatchId: match && index === 0 ? manualId : null,
    })),
  });
  const commit = (input: unknown) =>
    api()
      .post('/api/v1/household/import/commit')
      .field('accountId', accountId)
      .field('decisions', JSON.stringify(input))
      .attach('file', csv, 'test.csv');

  it('validates money before writing and preserves manual expense ids', async () => {
    await api()
      .post('/api/v1/household/expenses')
      .send({ amount: '4.301', date: '2026-06-02', categoryId })
      .expect(400);
    const response = await api()
      .post('/api/v1/household/expenses')
      .send({
        amount: '4.30',
        date: '2026-06-02',
        categoryId,
        merchant: 'Bilet ręcznie',
      })
      .expect(201);
    manualId = response.body.id;
    expect(response.body.origin).toBe('MANUAL');
  });
  it('detects possible manual matches without merging identical legitimate bank operations', async () => {
    const response = await api()
      .post('/api/v1/household/import/preview')
      .field('accountId', accountId)
      .attach('file', csv, 'test.csv')
      .expect(201);
    expect(response.body.rows).toHaveLength(2);
    expect(response.body.rows[0].merchant).toBe('Jakdojade');
    expect(response.body.rows[0].manualCandidates[0].id).toBe(manualId);
  });
  it('rejects incomplete imports without writing a batch', async () => {
    const input = decisions();
    input.decisions[1].categoryId = 'missing';
    await commit(input).expect(400);
    expect(await db.importBatch.count()).toBe(0);
    expect(await db.expense.count()).toBe(1);
  });
  it('atomically imports two bank operations and reconciles a manual expense', async () => {
    const response = await commit(decisions(true)).expect(201);
    batchId = response.body.id;
    expect(response.body.count).toBe(2);
    expect(await db.expense.count()).toBe(2);
    expect(
      (await db.expense.findUniqueOrThrow({ where: { id: manualId } }))
        .externalId,
    ).toBe('bank-1');
  });
  it('prevents reimport duplicates and safely refuses deletion of a used category', async () => {
    const response = await api()
      .post('/api/v1/household/import/preview')
      .field('accountId', accountId)
      .attach('file', csv, 'test.csv')
      .expect(201);
    expect(
      response.body.rows.every((row: { duplicate: boolean }) => row.duplicate),
    ).toBe(true);
    await commit(decisions()).expect(400);
    await api()
      .delete(`/api/v1/household/categories/${categoryId}`)
      .expect(409);
    expect(await db.expense.count()).toBe(2);
  });
  it('undoes import and restores the original manual expense', async () => {
    await api().delete(`/api/v1/household/imports/${batchId}`).expect(200);
    expect(await db.expense.count()).toBe(1);
    const original = await db.expense.findUniqueOrThrow({
      where: { id: manualId },
    });
    expect(original.origin).toBe('MANUAL');
    expect(original.externalId).toBeNull();
    expect(original.merchant).toBe('Bilet ręcznie');
  });
  it('does not add bank files on top of legacy history without explicit reconciliation', async () => {
    const legacy = await db.expense.create({
      data: { amount: '8.60', categoryId, date: new Date('2026-06-02') },
    });
    await commit(decisions()).expect(409);
    expect(await db.importBatch.count()).toBe(0);
    await db.expense.delete({ where: { id: legacy.id } });
  });
  it('preserves categories, budgets and goals independently of monthly rollover', async () => {
    await api()
      .post('/api/v1/household/incomes')
      .send({ amount: '10000', sourceId, date: '2026-06-01' })
      .expect(201);
    await api()
      .put('/api/v1/household/budgets/2026-06')
      .send({ amount: '4000', categoryLimits: { [categoryId]: '500' } })
      .expect(200);
    const goal = await api()
      .post('/api/v1/household/goals')
      .send({
        name: 'Poduszka',
        target: '50000',
        initialAmount: '1000',
        startDate: '2026-06-01',
        deadline: '2026-12-01',
      })
      .expect(201);
    await api()
      .post(`/api/v1/household/goals/${goal.body.id}/contributions`)
      .send({ amount: '500', date: '2026-06-05' })
      .expect(201);
    const june = await api().get('/api/v1/household?month=2026-06').expect(200);
    expect(june.body.budget.amount).toBe('4000');
    expect(june.body.goals[0].contributions[0].amount).toBe('500');
    expect(june.body.trend[0].spending).toMatch(/^4\.30/);
    const july = await api().get('/api/v1/household?month=2026-07').expect(200);
    expect(july.body.budget).toBeNull();
    expect(july.body.goals).toHaveLength(1);
  });
  it('validates adjacent meter readings and reports irregular intervals', async () => {
    const meter = await api()
      .post('/api/v1/household/meters')
      .send({ name: 'Zimna woda', unit: 'm³', expectedMonthlyUsage: 4 })
      .expect(201);
    const meterTypeId = meter.body.id;
    await api()
      .post('/api/v1/household/readings')
      .send({ meterTypeId, date: '2026-05-01', value: 10 })
      .expect(201);
    await api()
      .post('/api/v1/household/readings')
      .send({ meterTypeId, date: '2026-06-10', value: 14 })
      .expect(201);
    await api()
      .post('/api/v1/household/readings')
      .send({ meterTypeId, date: '2026-05-20', value: 15 })
      .expect(400);
    await api()
      .post('/api/v1/household/readings')
      .send({ meterTypeId, date: '2026-06-10', value: 14 })
      .expect(409);
    const response = await api()
      .get('/api/v1/household?month=2026-06')
      .expect(200);
    expect(response.body.meters[0].intervals[0]).toMatchObject({
      days: 40,
      usage: 4,
    });
  });

  let subscriptionId: string;
  let fixedId: string;
  let subscriptionExpenseId: string;
  let subscriptionPaymentId: string;
  it('stores subscriptions and fixed bills without creating any expenses or changing budget totals', async () => {
    const before = await db.expense.count();
    const sub = await api()
      .post('/api/v1/household/recurring')
      .send({
        name: 'Spotify',
        type: 'SUBSCRIPTION',
        amount: '240',
        intervalMonths: 12,
        anchorDate: '2026-06-01',
        status: 'ACTIVE',
        matchPattern: 'spotify',
      })
      .expect(201);
    subscriptionId = sub.body.id;
    const fixed = await api()
      .post('/api/v1/household/recurring')
      .send({
        name: 'Czynsz',
        type: 'FIXED',
        amount: '800',
        intervalMonths: 1,
        anchorDate: '2026-06-01',
        status: 'ACTIVE',
        categoryId,
      })
      .expect(201);
    fixedId = fixed.body.id;
    await api()
      .post('/api/v1/household/recurring')
      .send({
        name: 'Nieaktywna',
        type: 'SUBSCRIPTION',
        amount: '100',
        intervalMonths: 1,
        anchorDate: '2026-06-01',
        status: 'PAUSED',
      })
      .expect(201);
    expect(await db.expense.count()).toBe(before);
    const response = await api()
      .get('/api/v1/household?month=2026-06')
      .expect(200);
    expect(response.body.recurring.totals.all).toMatchObject({
      count: 2,
      monthly: '820.00',
      yearly: '9840.00',
      scheduled: '1040.00',
      yearScheduled: '5840.00',
    });
    expect(response.body.recurring.totals.fixed.monthly).toBe('800.00');
    expect(response.body.recurring.totals.subscriptions.yearly).toBe('240.00');
  });
  it('suggests a differently priced expense but requires explicit confirmation, without double counting', async () => {
    const expense = await api()
      .post('/api/v1/household/expenses')
      .send({
        amount: '250',
        categoryId,
        merchant: 'Spotify',
        date: '2026-06-02',
      })
      .expect(201);
    subscriptionExpenseId = expense.body.id;
    const overview = await api()
      .get('/api/v1/household?month=2026-06')
      .expect(200);
    expect(overview.body.recurring.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          chargeId: subscriptionId,
          priceChanged: true,
        }),
      ]),
    );
    expect(await db.chargePayment.count()).toBe(0);
    const before = await db.expense.count();
    const payment = await api()
      .post(`/api/v1/household/recurring/${subscriptionId}/payments`)
      .send({ expenseId: subscriptionExpenseId, dueDate: '2026-06-01' })
      .expect(201);
    subscriptionPaymentId = payment.body.id;
    expect(await db.expense.count()).toBe(before);
    expect(
      (
        await db.recurringCharge.findUniqueOrThrow({
          where: { id: subscriptionId },
        })
      ).amount.toFixed(2),
    ).toBe('240.00');
    await api()
      .post(`/api/v1/household/recurring/${fixedId}/payments`)
      .send({ expenseId: subscriptionExpenseId, dueDate: '2026-06-01' })
      .expect(409);
  });
  it('atomically saves an explicitly requested manual bill and prevents two charges for one due date', async () => {
    const input = {
      amount: '790',
      categoryId,
      date: '2026-06-01',
      description: 'Czynsz',
      chargeId: fixedId,
      dueDate: '2026-06-01',
    };
    await api().post('/api/v1/household/expenses').send(input).expect(201);
    const count = await db.expense.count();
    await api().post('/api/v1/household/expenses').send(input).expect(409);
    expect(await db.expense.count()).toBe(count);
    expect(await db.chargePayment.count()).toBe(2);
  });
  it('unlinks confirmations without deleting their financial transaction', async () => {
    const count = await db.expense.count();
    await api()
      .delete(`/api/v1/household/payments/${subscriptionPaymentId}`)
      .expect(200);
    expect(await db.expense.count()).toBe(count);
    expect(
      await db.expense.findUnique({ where: { id: subscriptionExpenseId } }),
    ).not.toBeNull();
    const payment = await api()
      .post(`/api/v1/household/recurring/${subscriptionId}/payments`)
      .send({ expenseId: subscriptionExpenseId, dueDate: '2026-06-01' })
      .expect(201);
    subscriptionPaymentId = payment.body.id;
  });
  it('reports only actual expenses, respects budget exclusions, refunds and internal transfers', async () => {
    for (const data of [
      { amount: '5000', kind: 'TRANSFER' },
      { amount: '100', kind: 'LOAN_OVERPAYMENT' },
      { amount: '20', excludedFromBudget: true },
      { amount: '10', kind: 'REFUND' },
    ]) {
      await api()
        .post('/api/v1/household/expenses')
        .send({ ...data, categoryId, date: '2026-06-03' })
        .expect(201);
    }
    const excludedCategory = await db.category.create({
      data: { name: 'Poza limitem', excludedFromBudget: true },
    });
    await api()
      .post('/api/v1/household/expenses')
      .send({
        amount: '30',
        categoryId: excludedCategory.id,
        date: '2026-06-03',
      })
      .expect(201);
    const budget = await api()
      .get(
        '/api/v1/household/analytics?from=2026-06-01&to=2026-06-30&scope=budget',
      )
      .expect(200);
    expect(budget.body.totals).toMatchObject({
      spending: 1034.3,
      income: 10000,
      loan: 100,
      surplus: 8815.7,
    });
    expect(budget.body.daily.at(-1).spending).toBe(1034.3);
    expect(budget.body.series[0].spending).toBe(1034.3);
    expect(budget.body.completeMonths).toBe(true);
    const ordinary = await api()
      .get(
        '/api/v1/household/analytics?from=2026-06-01&to=2026-06-30&scope=ordinary',
      )
      .expect(200);
    expect(ordinary.body.totals.spending).toBe(1084.3);
    const refunds = await api()
      .get(
        '/api/v1/household/analytics?from=2026-06-03&to=2026-06-03&scope=budget',
      )
      .expect(200);
    expect(refunds.body.totals.spending).toBe(-10);
    expect(refunds.body.categories[0].amount).toBe(-10);
    expect(
      ordinary.body.expenses.every(
        (row: { kind: string }) =>
          !['TRANSFER', 'LOAN_OVERPAYMENT'].includes(row.kind),
      ),
    ).toBe(true);
  });
  it('rejects invalid schedules, unsafe URLs and invalid analytical ranges', async () => {
    await api()
      .post('/api/v1/household/recurring')
      .send({
        name: 'Błąd',
        amount: '10',
        intervalMonths: 0,
        anchorDate: '2026-06-01',
      })
      .expect(400);
    await api()
      .post('/api/v1/household/recurring')
      .send({
        name: 'Błąd',
        amount: '10',
        intervalMonths: 1,
        anchorDate: '2026-06-01',
        website: 'javascript:alert(1)',
      })
      .expect(400);
    await api()
      .post(`/api/v1/household/recurring/${fixedId}/payments`)
      .send({ expenseId: manualId, dueDate: '2026-06-02' })
      .expect(400);
    await api()
      .get('/api/v1/household/analytics?from=2026-07-01&to=2026-06-01')
      .expect(400);
    await api()
      .get('/api/v1/household/analytics?from=2020-01-01&to=2026-06-01')
      .expect(400);
  });
  it('deleting a subscription preserves its linked expenses', async () => {
    const before = await db.expense.count();
    await api()
      .delete(`/api/v1/household/recurring/${subscriptionId}`)
      .expect(200);
    expect(await db.expense.count()).toBe(before);
    expect(
      await db.chargePayment.findUnique({
        where: { id: subscriptionPaymentId },
      }),
    ).toBeNull();
  });

  it('advances the displayed next unpaid date and preserves payments when pausing a plan', async () => {
    const today = new Date().toLocaleDateString('sv-SE', {
      timeZone: 'Europe/Warsaw',
    });
    const input = {
      name: 'Bieżąca usługa',
      amount: '10',
      intervalMonths: 1,
      anchorDate: today,
      status: 'ACTIVE',
    };
    const charge = await api()
      .post('/api/v1/household/recurring')
      .send(input)
      .expect(201);
    const expense = await api()
      .post('/api/v1/household/expenses')
      .send({
        amount: '10',
        categoryId,
        date: today,
        chargeId: charge.body.id,
        dueDate: today,
      })
      .expect(201);
    const overview = await api()
      .get(`/api/v1/household?month=${today.slice(0, 7)}`)
      .expect(200);
    const found = overview.body.recurring.charges.find(
      (row: { id: string }) => row.id === charge.body.id,
    );
    expect(found.nextDueDate > today).toBe(true);
    await api()
      .put(`/api/v1/household/expenses/${expense.body.id}`)
      .send({ amount: '10', categoryId, date: today, kind: 'TRANSFER' })
      .expect(409);
    const before = await db.expense.count();
    await api()
      .put(`/api/v1/household/recurring/${charge.body.id}`)
      .send({ ...input, status: 'PAUSED' })
      .expect(200);
    expect(await db.expense.count()).toBe(before);
    const paused = await api()
      .get(`/api/v1/household?month=${today.slice(0, 7)}`)
      .expect(200);
    const pausedCharge = paused.body.recurring.charges.find(
      (row: { id: string }) => row.id === charge.body.id,
    );
    expect(pausedCharge.nextDueDate).toBeNull();
    expect(pausedCharge.payments).toHaveLength(1);
  });

  it('serializes linking a payment against changing the same expense into a transfer', async () => {
    const charge = await api()
      .post('/api/v1/household/recurring')
      .send({
        name: 'Równoległa opłata',
        amount: '15',
        intervalMonths: 1,
        anchorDate: '2026-06-01',
      })
      .expect(201);
    const expense = await api()
      .post('/api/v1/household/expenses')
      .send({ amount: '15', categoryId, date: '2026-06-01' })
      .expect(201);
    const results = await Promise.all([
      api()
        .post(`/api/v1/household/recurring/${charge.body.id}/payments`)
        .send({ expenseId: expense.body.id, dueDate: '2026-06-01' }),
      api().put(`/api/v1/household/expenses/${expense.body.id}`).send({
        amount: '15',
        categoryId,
        date: '2026-06-01',
        kind: 'TRANSFER',
      }),
    ]);
    expect(
      results.every((result) => [200, 201, 400, 409].includes(result.status)),
    ).toBe(true);
    const saved = await db.expense.findUniqueOrThrow({
      where: { id: expense.body.id },
      include: { chargePayment: true },
    });
    expect(saved.kind === 'TRANSFER' && saved.chargePayment !== null).toBe(
      false,
    );
  });

  const csvCall = (
    action: string,
    buffer: Buffer,
    input: unknown,
    account = accountId,
  ) =>
    api()
      .post(`/api/v1/household/csv/${action}`)
      .field('accountId', account)
      .field('input', JSON.stringify(input))
      .attach('file', buffer, 'universal.csv');

  it('stores, updates and deletes templates scoped to their account', async () => {
    const buffer = Buffer.from('Data;Opis;Kwota\n05.11.2026;Test;-12,30');
    const inspected = await csvCall('inspect', buffer, {}).expect(201);
    expect(inspected.body.config.columns).toMatchObject({
      date: 0,
      title: 1,
      amount: 2,
    });
    const config = inspected.body.config;
    const saved = await api()
      .post(`/api/v1/household/csv/${accountId}/templates`)
      .send({ name: 'Arkusz', config })
      .expect(201);
    const updated = await api()
      .post(`/api/v1/household/csv/${accountId}/templates`)
      .send({ name: 'Arkusz', config: { ...config, mode: 'expense' } })
      .expect(201);
    expect(updated.body.id).toBe(saved.body.id);
    const other = await db.bankAccount.create({
      data: { name: 'Inne konto CSV' },
    });
    expect(
      (
        await api()
          .get(`/api/v1/household/csv/${other.id}/templates`)
          .expect(200)
      ).body,
    ).toEqual([]);
    await api()
      .delete(`/api/v1/household/csv/${other.id}/templates/${saved.body.id}`)
      .expect(200);
    expect(
      (
        await api()
          .get(`/api/v1/household/csv/${accountId}/templates`)
          .expect(200)
      ).body,
    ).toHaveLength(1);
    await api()
      .delete(`/api/v1/household/csv/${accountId}/templates/${saved.body.id}`)
      .expect(200);
    expect(
      (
        await api()
          .get(`/api/v1/household/csv/${accountId}/templates`)
          .expect(200)
      ).body,
    ).toEqual([]);
  });

  it('requires explicit invalid-row omission and a valid income source, then atomically imports and undoes both kinds', async () => {
    const buffer = Buffer.from(
      'Data;Opis;Kwota;ID\n05.11.2026;Zakup;-12,30;csv-expense\n06.11.2026;Pensja;5000,10;csv-income\n31.02.2026;Błąd;-12,30;csv-bad',
    );
    const config = inspectCsv(buffer).config;
    const preview = await csvCall('preview', buffer, { config }).expect(201);
    expect(preview.body.rows.map((r: { kind: string }) => r.kind)).toEqual([
      'EXPENSE',
      'INCOME',
    ]);
    expect(preview.body.errors).toHaveLength(1);
    const decisions = preview.body.rows.map(
      (r: { externalId: string; kind: string }) => ({
        externalId: r.externalId,
        kind: r.kind,
        merchant: 'Test CSV',
        categoryId,
        sourceId,
      }),
    );
    const before = await db.importBatch.count();
    await csvCall('commit', buffer, { config, decisions }).expect(400);
    await csvCall('commit', buffer, {
      config,
      skipInvalid: true,
      decisions: decisions.map((d, i) =>
        i === 1 ? { ...d, sourceId: 'missing' } : d,
      ),
    }).expect(400);
    expect(await db.importBatch.count()).toBe(before);
    const saved = await csvCall('commit', buffer, {
      config,
      decisions,
      skipInvalid: true,
    }).expect(201);
    expect(saved.body.count).toBe(2);
    expect(saved.body.skippedInvalid).toBe(1);
    expect(
      (
        await db.income.findFirstOrThrow({
          where: { accountId, externalId: 'csv-income' },
        })
      ).amount.toString(),
    ).toBe('5000.1');
    const repeated = await csvCall('preview', buffer, { config }).expect(201);
    expect(
      repeated.body.rows.every((r: { duplicate: boolean }) => r.duplicate),
    ).toBe(true);
    const state = await api()
      .get('/api/v1/household?month=2026-11')
      .expect(200);
    expect(
      state.body.imports.find((b: { id: string }) => b.id === saved.body.id)
        ._count,
    ).toEqual({ expenses: 1, incomes: 1 });
    await api()
      .delete(`/api/v1/household/imports/${saved.body.id}`)
      .expect(200);
    expect(await db.income.count({ where: { importId: saved.body.id } })).toBe(
      0,
    );
    expect(await db.expense.count({ where: { importId: saved.body.id } })).toBe(
      0,
    );
  });

  it('serializes concurrent imports and never duplicates one bank ID across expense and income tables', async () => {
    const buffer = Buffer.from(
      'Data;Opis;Kwota;ID\n07.11.2026;Wpływ;100,00;concurrent-csv',
    );
    const config = inspectCsv(buffer).config;
    const common = {
      externalId: 'concurrent-csv',
      merchant: 'Wpływ',
      categoryId,
      sourceId,
    };
    const responses = await Promise.all([
      csvCall('commit', buffer, {
        config,
        decisions: [{ ...common, kind: 'INCOME' }],
      }),
      csvCall('commit', buffer, {
        config,
        decisions: [{ ...common, kind: 'REFUND' }],
      }),
    ]);
    expect(responses.map((r) => r.status)).toEqual([201, 201]);
    expect(responses.reduce((sum, r) => sum + r.body.count, 0)).toBe(1);
    expect(
      (await db.income.count({ where: { externalId: common.externalId } })) +
        (await db.expense.count({ where: { externalId: common.externalId } })),
    ).toBe(1);
  });

  it('preserves identical no-ID purchases and requires explicit override for already imported lookalikes', async () => {
    const buffer = Buffer.from(
      'Data;Opis;Kwota\n08.11.2026;Kawa;-10,00\n08.11.2026;Kawa;-10,00',
    );
    const config = inspectCsv(buffer).config;
    const preview = await csvCall('preview', buffer, { config }).expect(201);
    const decisions = preview.body.rows.map((r: { externalId: string }) => ({
      externalId: r.externalId,
      merchant: 'Kawa',
      kind: 'EXPENSE',
      categoryId,
    }));
    expect(
      (await csvCall('commit', buffer, { config, decisions }).expect(201)).body
        .count,
    ).toBe(2);
    expect(
      (await csvCall('commit', buffer, { config, decisions }).expect(201)).body
        .count,
    ).toBe(0);
    const repeated = await csvCall('preview', buffer, { config }).expect(201);
    expect(
      repeated.body.rows.every(
        (r: { duplicate: boolean; syntheticId: boolean }) =>
          r.duplicate && r.syntheticId,
      ),
    ).toBe(true);
    expect(
      (
        await csvCall('commit', buffer, {
          config,
          decisions: decisions.map((d, i) => ({
            ...d,
            skip: i !== 0,
            allowDuplicate: i === 0,
          })),
        }).expect(201)
      ).body.count,
    ).toBe(1);
  });

  it('defaults recognized own transfers to skipped while allowing explicit opt-in', async () => {
    const ownNumber = '61109010140000071219812874';
    await db.bankAccount.create({
      data: { name: 'Własne oszczędności', number: ownNumber },
    });
    const buffer = Buffer.from(
      `Data;Opis;Kwota;ID;Nr rachunku\n05.01.2027;Przelew własny;-100,00;own-csv;${ownNumber}\n05.01.2027;Zakup;-12,30;purchase-csv;`,
    );
    const config = inspectCsv(buffer).config;
    const preview = await csvCall('preview', buffer, { config }).expect(201);
    expect(preview.body.rows[0]).toMatchObject({
      kind: 'TRANSFER',
      skip: true,
    });
    expect(preview.body.rows[1]).toMatchObject({
      kind: 'EXPENSE',
      skip: false,
    });
    const decisions = preview.body.rows.map(
      (r: { externalId: string; kind: string; skip: boolean }) => ({
        externalId: r.externalId,
        kind: r.kind,
        skip: r.skip,
        merchant: 'CSV',
        categoryId,
      }),
    );
    expect(
      (await csvCall('commit', buffer, { config, decisions }).expect(201)).body
        .count,
    ).toBe(1);
    expect(await db.expense.count({ where: { externalId: 'own-csv' } })).toBe(
      0,
    );
    const enabled = decisions.map((d: { skip: boolean }) => ({
      ...d,
      skip: false,
    }));
    expect(
      (
        await csvCall('commit', buffer, { config, decisions: enabled }).expect(
          201,
        )
      ).body.count,
    ).toBe(1);
    expect(
      await db.expense.findFirst({ where: { externalId: 'own-csv' } }),
    ).toMatchObject({ kind: 'TRANSFER' });
  });

  it('requires reconciliation before importing income over prior unbanked income history', async () => {
    const prior = await db.income.create({
      data: { amount: '800', date: new Date('2026-12-01T00:00:00Z'), sourceId },
    });
    const buffer = Buffer.from(
      'Data;Opis;Kwota;ID\n01.12.2026;Premia;800,00;prior-income-csv',
    );
    const config = inspectCsv(buffer).config;
    const preview = await csvCall('preview', buffer, { config }).expect(201);
    expect(preview.body.legacyCount).toBeGreaterThan(0);
    const decisions = [
      {
        externalId: 'prior-income-csv',
        merchant: 'Premia',
        kind: 'INCOME',
        sourceId,
      },
    ];
    await csvCall('commit', buffer, { config, decisions }).expect(409);
    expect(
      await db.income.count({ where: { externalId: 'prior-income-csv' } }),
    ).toBe(0);
    const saved = await csvCall('commit', buffer, {
      config,
      decisions,
      acknowledgeLegacy: true,
    }).expect(201);
    expect(saved.body.count).toBe(1);
    await api()
      .delete(`/api/v1/household/imports/${saved.body.id}`)
      .expect(200);
    expect(
      await db.income.findUnique({ where: { id: prior.id } }),
    ).not.toBeNull();
  });

  it('keeps a global merchant catalog and renames every historical assignment without changing amounts', async () => {
    const create = (date: string, merchant: string, amount: string) =>
      api()
        .post('/api/v1/household/expenses')
        .send({ date, amount, categoryId, merchant })
        .expect(201);
    const first = await create('2027-02-01', '  Testowy   Sklep ', '10.10');
    const second = await create('2027-03-01', 'testowy sklep', '20.40');
    expect(first.body.merchantId).toBeTruthy();
    expect(second.body.merchantId).toBe(first.body.merchantId);
    const catalog = await api()
      .get('/api/v1/household?month=2026-01')
      .expect(200);
    expect(
      catalog.body.merchants.find(
        (m: { id: string }) => m.id === first.body.merchantId,
      )._count.expenses,
    ).toBe(2);
    await api()
      .put(`/api/v1/household/merchants/${first.body.merchantId}`)
      .send({ name: 'Poprawiona nazwa sklepu' })
      .expect(200);
    const saved = await db.expense.findMany({
      where: { merchantId: first.body.merchantId },
    });
    expect(saved.map((e) => e.merchant)).toEqual([
      'Poprawiona nazwa sklepu',
      'Poprawiona nazwa sklepu',
    ]);
    expect(saved.reduce((sum, e) => sum + Number(e.amount), 0)).toBe(30.5);
    const report = await api()
      .get(
        `/api/v1/household/analytics?from=2027-02-01&to=2027-03-31&scope=ordinary&categoryId=${categoryId}`,
      )
      .expect(200);
    expect(report.body.merchants).toContainEqual({
      name: 'Poprawiona nazwa sklepu',
      amount: 30.5,
    });
    await api()
      .delete(`/api/v1/household/merchants/${first.body.merchantId}`)
      .expect(200);
    const detached = await db.expense.findMany({
      where: { id: { in: [first.body.id, second.body.id] } },
    });
    expect(detached).toHaveLength(2);
    expect(
      detached.every((e) => e.merchantId === null && e.merchant === null),
    ).toBe(true);
    expect(detached.reduce((sum, e) => sum + Number(e.amount), 0)).toBe(30.5);
  });

  it('learns a confirmed CSV merchant for future months and updates the learned identity after correction', async () => {
    const buffer = Buffer.from(
      'Data;Opis;Kontrahent;Kwota;ID\n01.04.2027;Zakup kartą;TERMINAL ZIELONY KRAKÓW;-11,50;learn-first',
    );
    const config = inspectCsv(buffer).config;
    const imported = await csvCall('commit', buffer, {
      config,
      decisions: [
        {
          externalId: 'learn-first',
          merchant: 'Zielony sklep',
          categoryId,
          kind: 'EXPENSE',
        },
      ],
    }).expect(201);
    expect(imported.body.count).toBe(1);
    const future = Buffer.from(
      'Data;Opis;Kontrahent;Kwota;ID\n01.05.2027;Zakup kartą;TERMINAL ZIELONY KRAKÓW;-12,50;learn-future',
    );
    const learned = await csvCall('preview', future, { config }).expect(201);
    expect(learned.body.rows[0]).toMatchObject({
      merchant: 'Zielony sklep',
      confidence: 'high',
      reason: 'Zapamiętany sklep',
    });
    const expense = await db.expense.findFirstOrThrow({
      where: { externalId: 'learn-first' },
    });
    await api()
      .put(`/api/v1/household/expenses/${expense.id}`)
      .send({
        amount: '11.50',
        categoryId,
        date: '2027-04-01',
        merchant: 'Sklep po korekcie',
      })
      .expect(200);
    expect(
      (await csvCall('preview', future, { config }).expect(201)).body.rows[0]
        .merchant,
    ).toBe('Sklep po korekcie');
  });

  it('uses precise merchant domains behind payment processors and leaves conflicting identities for review', async () => {
    const buffer = Buffer.from(
      'Data;Opis;Kontrahent;Kwota;ID\n01.06.2027;Płatność https://one-shop.test;PayPro S.A.;-10,00;domain-one\n01.06.2027;Płatność https://two-shop.test;PayPro S.A.;-20,00;domain-two\n01.06.2027;Zakup;WSPÓLNY ODBIORCA;-30,00;ambiguous-one\n01.06.2027;Zakup;WSPÓLNY ODBIORCA;-40,00;ambiguous-two',
    );
    const config = inspectCsv(buffer).config;
    const decisions = [
      'domain-one',
      'domain-two',
      'ambiguous-one',
      'ambiguous-two',
    ].map((externalId, i) => ({
      externalId,
      merchant: i % 2 ? 'Drugi sklep testowy' : 'Pierwszy sklep testowy',
      categoryId,
      kind: 'EXPENSE',
    }));
    await csvCall('commit', buffer, { config, decisions }).expect(201);
    const future = Buffer.from(
      'Data;Opis;Kontrahent;Kwota;ID\n01.07.2027;Płatność https://one-shop.test;PayPro S.A.;-10,00;future-domain\n01.07.2027;Nieznany zakup;PayPro S.A.;-20,00;future-processor\n01.07.2027;Zakup;WSPÓLNY ODBIORCA;-30,00;future-conflict',
    );
    const preview = await csvCall('preview', future, { config }).expect(201);
    expect(preview.body.rows[0]).toMatchObject({
      merchant: 'Pierwszy sklep testowy',
      confidence: 'high',
    });
    expect(preview.body.rows[1].merchant).toBe('PayPro S.A.');
    expect(preview.body.rows[1].confidence).toBe('low');
    expect(preview.body.rows[2]).toMatchObject({
      merchant: '',
      merchantId: null,
      confidence: 'low',
    });
  });

  it('restores the current catalog name from a manual snapshot and discards learning from an undone import', async () => {
    const original = await api()
      .post('/api/v1/household/expenses')
      .send({
        amount: '15',
        date: '2027-08-01',
        categoryId,
        merchant: 'Sklep oryginalny migawkowy',
      })
      .expect(201);
    const buffer = Buffer.from(
      'Data;Opis;Kontrahent;Kwota;ID\n01.08.2027;Zakup;SKLEP MIGAWKOWY TERMINAL;-15,00;snapshot-import',
    );
    const config = inspectCsv(buffer).config;
    const imported = await csvCall('commit', buffer, {
      config,
      decisions: [
        {
          externalId: 'snapshot-import',
          merchant: 'Bankowy sklep migawkowy',
          categoryId,
          kind: 'EXPENSE',
          manualMatchId: original.body.id,
        },
      ],
    }).expect(201);
    await api()
      .put(`/api/v1/household/merchants/${original.body.merchantId}`)
      .send({ name: 'Poprawiony sklep z migawki' })
      .expect(200);
    await api()
      .delete(`/api/v1/household/imports/${imported.body.id}`)
      .expect(200);
    expect(
      await db.expense.findUnique({ where: { id: original.body.id } }),
    ).toMatchObject({
      merchant: 'Poprawiony sklep z migawki',
      merchantId: original.body.merchantId,
      origin: 'MANUAL',
      externalId: null,
    });
    expect(
      await db.merchantAlias.count({
        where: { key: 'recipient:sklep migawkowy terminal' },
      }),
    ).toBe(0);
  });

  it.each(['merge', 'remove'] as const)(
    '%s reassigns live links, rules and import snapshots without changing financial data',
    async (action) => {
      const source = (
        await api()
          .post('/api/v1/household/merchants')
          .send({ name: `Źródłowy ${action}` })
          .expect(201)
      ).body;
      const target = (
        await api()
          .post('/api/v1/household/merchants')
          .send({ name: `Docelowy ${action}` })
          .expect(201)
      ).body;
      const original = (
        await api()
          .post('/api/v1/household/expenses')
          .send({
            amount: '19.99',
            date: '2029-01-01',
            categoryId,
            merchantId: source.id,
            description: 'Ręczny wpis',
            excludedFromBudget: true,
          })
          .expect(201)
      ).body;
      await api()
        .post('/api/v1/household/expenses')
        .send({
          amount: '30',
          date: '2029-02-01',
          categoryId,
          merchantId: target.id,
        })
        .expect(201);
      const rule = (
        await api()
          .post('/api/v1/household/rules')
          .send({
            pattern: `rule-${action}-test`,
            merchantId: source.id,
            merchant: source.name,
            categoryId,
            kind: 'REFUND',
          })
          .expect(201)
      ).body;
      const buffer = Buffer.from(
        `Data;Opis;Kontrahent;Kwota;ID\n01.01.2029;Zakup;MIGAWKA ${action};-19,99;${action}-snapshot\n02.01.2029;Zakup;TERMINAL ${action};-7,25;${action}-bank`,
      );
      const config = inspectCsv(buffer).config;
      const imported = await csvCall('commit', buffer, {
        config,
        decisions: [
          {
            externalId: `${action}-snapshot`,
            merchant: `Bankowy ${action}`,
            categoryId,
            kind: 'EXPENSE',
            manualMatchId: original.id,
          },
          {
            externalId: `${action}-bank`,
            merchantId: source.id,
            merchant: source.name,
            categoryId,
            kind: 'EXPENSE',
          },
        ],
      }).expect(201);
      await db.merchantAlias.createMany({
        data: [
          { key: `recipient:shared-${action}`, merchantId: source.id },
          { key: `recipient:shared-${action}`, merchantId: target.id },
        ],
      });
      const financial = async () =>
        (await db.expense.findMany({ orderBy: { id: 'asc' } })).map(
          ({
            id,
            amount,
            date,
            categoryId,
            description,
            kind,
            excludedFromBudget,
          }) => ({
            id,
            amount: amount.toString(),
            date,
            categoryId,
            description,
            kind,
            excludedFromBudget,
          }),
        );
      const before = await financial();
      const snapshotBefore = (
        await db.expense.findUniqueOrThrow({ where: { id: original.id } })
      ).raw as Record<string, any>;
      if (action === 'merge') {
        await api()
          .post(`/api/v1/household/merchants/${source.id}/merge`)
          .send({ targetId: source.id })
          .expect(400);
        await api()
          .post(`/api/v1/household/merchants/${source.id}/merge`)
          .send({ targetId: 'missing' })
          .expect(404);
        await api()
          .post(`/api/v1/household/merchants/${source.id}/merge`)
          .send({})
          .expect(400);
        await api()
          .post(`/api/v1/household/merchants/${source.id}/merge`)
          .send({ targetId: target.id })
          .expect(201);
      } else {
        await api()
          .delete(`/api/v1/household/merchants/${source.id}`)
          .expect(200);
      }
      expect(await financial()).toEqual(before);
      expect(
        await db.merchant.findUnique({ where: { id: source.id } }),
      ).toBeNull();
      expect(
        await db.merchantAlias.count({ where: { merchantId: source.id } }),
      ).toBe(0);
      expect(
        await db.merchantAlias.count({
          where: { key: `recipient:shared-${action}`, merchantId: target.id },
        }),
      ).toBe(1);
      const expected =
        action === 'merge'
          ? { merchantId: target.id, merchant: target.name }
          : { merchantId: null, merchant: null };
      expect(
        await db.expense.findFirstOrThrow({
          where: { externalId: `${action}-bank` },
        }),
      ).toMatchObject(expected);
      expect(
        await db.merchantRule.findUniqueOrThrow({ where: { id: rule.id } }),
      ).toMatchObject({
        ...expected,
        merchant: expected.merchant ?? '',
        categoryId,
        kind: 'REFUND',
      });
      const snapshotAfter = (
        await db.expense.findUniqueOrThrow({ where: { id: original.id } })
      ).raw as Record<string, any>;
      expect(snapshotAfter).toEqual({
        ...snapshotBefore,
        manualOriginal: { ...snapshotBefore.manualOriginal, ...expected },
      });
      const future = Buffer.from(
        `Data;Opis;Kontrahent;Kwota;ID\n01.03.2029;Zakup;TERMINAL ${action};-10,00;${action}-future`,
      );
      const preview = await csvCall('preview', future, { config }).expect(201);
      expect(preview.body.rows[0].merchantId).toBe(expected.merchantId);
      const ruleFuture = Buffer.from(
        `Data;Opis;Kontrahent;Kwota;ID\n01.03.2029;${rule.pattern};shared-${action};10,00;${action}-rule-future`,
      );
      const rulePreview = await csvCall('preview', ruleFuture, {
        config,
      }).expect(201);
      expect(rulePreview.body.rows[0]).toMatchObject({
        merchantId: expected.merchantId,
        categoryId,
        kind: 'REFUND',
      });
      if (action === 'merge')
        expect(preview.body.rows[0].merchant).toBe(target.name);
      else
        await api()
          .put(`/api/v1/household/rules/${rule.id}`)
          .send({
            pattern: rule.pattern,
            merchant: '',
            categoryId,
            kind: 'REFUND',
          })
          .expect(200);
      await api()
        .delete(`/api/v1/household/imports/${imported.body.id}`)
        .expect(200);
      expect(
        await db.expense.findUniqueOrThrow({ where: { id: original.id } }),
      ).toMatchObject({
        ...expected,
        origin: 'MANUAL',
        description: 'Ręczny wpis',
        excludedFromBudget: true,
      });
      expect(
        await db.merchant.findUnique({ where: { id: source.id } }),
      ).toBeNull();
    },
  );

  it('keeps category totals equal to their transaction list including out-of-budget purchases and refunds', async () => {
    const rows = [
      { amount: '100', kind: 'EXPENSE', excludedFromBudget: false },
      { amount: '20', kind: 'EXPENSE', excludedFromBudget: true },
      { amount: '5', kind: 'REFUND', excludedFromBudget: false },
      { amount: '1000', kind: 'TRANSFER', excludedFromBudget: false },
      { amount: '2000', kind: 'LOAN_OVERPAYMENT', excludedFromBudget: false },
    ];
    for (const row of rows)
      await api()
        .post('/api/v1/household/expenses')
        .send({ ...row, date: '2028-05-15', categoryId })
        .expect(201);
    const report = await api()
      .get(
        `/api/v1/household/analytics?from=2028-01-01&to=2028-12-31&scope=ordinary&categoryId=${categoryId}`,
      )
      .expect(200);
    expect(report.body.totals.spending).toBe(115);
    expect(report.body.expenses).toHaveLength(3);
    expect(
      report.body.expenses.reduce(
        (sum: number, row: { amount: string; kind: string }) =>
          sum + Number(row.amount) * (row.kind === 'REFUND' ? -1 : 1),
        0,
      ),
    ).toBe(115);
    const budget = await api()
      .get(
        `/api/v1/household/analytics?from=2028-01-01&to=2028-12-31&scope=budget&categoryId=${categoryId}`,
      )
      .expect(200);
    expect(budget.body.totals.spending).toBe(95);
    expect(budget.body.expenses).toHaveLength(2);
  });

  it('retains manual expense identity and restores its snapshot when undoing a universal import', async () => {
    const original = await db.expense.create({
      data: {
        amount: '19.99',
        date: new Date('2026-11-09T00:00:00Z'),
        categoryId,
        merchant: 'Oryginał',
        description: 'Ręcznie',
        origin: 'MANUAL',
      },
    });
    const buffer = Buffer.from(
      'Data;Opis;Kwota;ID\n09.11.2026;Sklep;-19,99;csv-manual',
    );
    const config = inspectCsv(buffer).config;
    const decisions = [
      {
        externalId: 'csv-manual',
        merchant: 'Sklep',
        kind: 'EXPENSE',
        categoryId,
        manualMatchId: original.id,
      },
    ];
    const saved = await csvCall('commit', buffer, { config, decisions }).expect(
      201,
    );
    expect(
      (await db.expense.findUniqueOrThrow({ where: { id: original.id } }))
        .externalId,
    ).toBe('csv-manual');
    await api()
      .delete(`/api/v1/household/imports/${saved.body.id}`)
      .expect(200);
    expect(
      await db.expense.findUniqueOrThrow({ where: { id: original.id } }),
    ).toMatchObject({
      merchant: 'Oryginał',
      description: 'Ręcznie',
      origin: 'MANUAL',
      externalId: null,
      importId: null,
    });
  });
});
