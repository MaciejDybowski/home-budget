import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createRequire } from 'node:module';

const { MerchantsService } = createRequire(import.meta.url)('../dist/household/merchants.service.js');

if (!process.argv.includes('--confirm-empty')) {
  console.error('Use npm run db:demo -- --confirm-empty on an empty demonstration database.');
  process.exit(1);
}
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const merchants = new MerchantsService(db);
const today = new Date();
const month = today.toISOString().slice(0, 7);
const date = (day, offset = 0) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, day));
try {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(726462901)`;
    await tx.$executeRaw`LOCK TABLE "Expense", "Income", "Category", "CategoryPattern",
      "IncomeSource", "BankAccount", "Merchant", "MerchantRule", "MerchantAlias",
      "ImportBatch", "CsvImportTemplate", "MonthlyBudget", "RecurringCharge",
      "ChargePayment", "SavingsGoal", "GoalContribution", "MeterType", "MeterReading"
      IN SHARE ROW EXCLUSIVE MODE`;
    // Refuse ANY existing application data; never reset or append to a real household.
    for (const model of ['expense', 'income', 'category', 'incomeSource', 'bankAccount',
      'merchant', 'merchantRule', 'merchantAlias', 'importBatch', 'csvImportTemplate',
      'monthlyBudget', 'recurringCharge', 'savingsGoal', 'meterType']) {
      if (await tx[model].count()) throw new Error('Database is not empty. Demo data was not written.');
    }
    const food = await tx.category.create({ data: { name: 'Żywność', color: '#b7d7a8' } });
    const bills = await tx.category.create({ data: { name: 'Rachunki', color: '#a7c7e7' } });
    const transport = await tx.category.create({ data: { name: 'Transport', color: '#f9d5a7' } });
    await tx.category.create({ data: { name: 'Przyjemności', color: '#dab6e8' } });
    const source = await tx.incomeSource.create({ data: { name: 'Pensja — przykład' } });
    await tx.bankAccount.create({ data: { name: 'Konto demonstracyjne' } });
    const shop = await merchants.resolve(tx, null, 'Sklep Przykładowy');
    const market = await merchants.resolve(tx, null, 'Zielony Market');
    for (let offset = -2; offset <= 0; offset++) {
      await tx.income.create({ data: { amount: '6500.00', date: date(1, offset), sourceId: source.id, description: 'Fikcyjny wpływ', } });
      await tx.expense.createMany({ data: [
        { amount: '125.40', date: date(2, offset), categoryId: food.id, ...shop, description: 'Przykładowe zakupy', origin: 'MANUAL' },
        { amount: '84.60', date: date(3, offset), categoryId: food.id, ...market, description: 'Warzywa i owoce — przykład', origin: 'MANUAL' },
        { amount: '18.90', date: date(4, offset), categoryId: transport.id, description: 'Przykładowy bilet', origin: 'MANUAL' },
        { amount: '1200.00', date: date(1, offset), categoryId: bills.id, description: 'Mieszkanie — kwota demonstracyjna', origin: 'MANUAL' },
        { amount: '10.00', date: date(5, offset), categoryId: food.id, ...shop, description: 'Przykładowy zwrot', kind: 'REFUND', origin: 'MANUAL' },
      ] });
    }
    await tx.monthlyBudget.create({ data: { month, amount: '4000.00', categoryLimits: { [food.id]: '1200.00', [bills.id]: '1800.00' } } });
    await tx.recurringCharge.create({ data: { name: 'Muzyka — przykład', type: 'SUBSCRIPTION', amount: '29.99', intervalMonths: 1, anchorDate: date(1), categoryId: bills.id } });
    const goal = await tx.savingsGoal.create({ data: { name: 'Przykładowe wakacje', target: '8000.00', initialAmount: '1000.00', startDate: date(1, -2), deadline: date(1, 6) } });
    await tx.goalContribution.create({ data: { goalId: goal.id, amount: '500.00', date: date(1) } });
    const meter = await tx.meterType.create({ data: { name: 'Woda — przykład', unit: 'm³', color: '#a7c7e7', expectedMonthlyUsage: 4 } });
    await tx.meterReading.createMany({ data: [-2, -1, 0].map((offset, index) => ({ meterTypeId: meter.id, date: date(1, offset), value: 100 + index * 4 })) });
  });
  console.log(`Fictional demo data created for ${month} and the preceding two months.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
