import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { dateOnly } from './domain';

const cents = (value: unknown) => Math.round(Number(value) * 100);

@Injectable()
export class AnalyticsService {
  constructor(private readonly db: PrismaService) {}

  async report(
    fromInput: string,
    toInput: string,
    scope = 'budget',
    categoryId?: string,
  ) {
    const from = dateOnly(fromInput);
    const to = dateOnly(toInput);
    const days = Math.round((to.getTime() - from.getTime()) / 86400000) + 1;
    if (days < 1 || days > 731 || !['budget', 'ordinary'].includes(scope))
      throw new BadRequestException(
        'Wybierz poprawny zakres do dwóch lat i rodzaj wydatków.',
      );
    const previousFrom = new Date(from.getTime() - days * 86400000);
    const [allExpenses, allIncomes, budgets, categories] = await Promise.all([
      this.db.expense.findMany({
        where: { date: { gte: previousFrom, lte: to } },
        include: {
          category: true,
          chargePayment: {
            include: { charge: { select: { id: true, name: true } } },
          },
        },
        orderBy: { date: 'desc' },
      }),
      this.db.income.findMany({
        where: { date: { gte: from, lte: to } },
        include: { source: true },
        orderBy: { date: 'desc' },
      }),
      this.db.monthlyBudget.findMany({
        where: {
          month: { gte: fromInput.slice(0, 7), lte: toInput.slice(0, 7) },
        },
        orderBy: { month: 'asc' },
      }),
      this.db.category.findMany({ orderBy: { name: 'asc' } }),
    ]);
    if (
      categoryId &&
      !categories.some((category) => category.id === categoryId)
    )
      throw new BadRequestException('Nieznana kategoria.');
    type Expense = (typeof allExpenses)[number];
    const signed = (expense: Expense) =>
      (expense.kind === 'REFUND' ? -1 : 1) * cents(expense.amount);
    const ordinary = (expense: Expense) =>
      ['EXPENSE', 'REFUND'].includes(expense.kind);
    const matches = (expense: Expense) =>
      ordinary(expense) &&
      (!categoryId || expense.categoryId === categoryId) &&
      (scope !== 'budget' ||
        (!expense.excludedFromBudget && !expense.category.excludedFromBudget));
    const period = allExpenses.filter((expense) => expense.date >= from);
    const expenses = period.filter(matches);
    const previous = allExpenses.filter(
      (expense) => expense.date < from && matches(expense),
    );
    const sum = (rows: Expense[]) =>
      rows.reduce((total, expense) => total + signed(expense), 0);
    const spending = sum(expenses);
    const previousSpending = sum(previous);
    const income = allIncomes.reduce((sum, row) => sum + cents(row.amount), 0);
    const loan = period
      .filter((row) => row.kind === 'LOAN_OVERPAYMENT')
      .reduce((sum, row) => sum + cents(row.amount), 0);
    const surplus = income - sum(period.filter(ordinary)) - loan;
    const categoryTotals = categories
      .map((category) => ({
        id: category.id,
        name: category.name,
        color: category.color || '#497b78',
        amount:
          sum(expenses.filter((row) => row.categoryId === category.id)) / 100,
      }))
      .filter((category) => category.amount !== 0)
      .sort((a, b) => b.amount - a.amount);
    const merchantMap = new Map<string, number>();
    for (const expense of expenses) {
      const merchant = expense.merchant || 'Nieprzypisany sprzedawca';
      merchantMap.set(
        merchant,
        (merchantMap.get(merchant) || 0) + signed(expense),
      );
    }
    const merchants = [...merchantMap]
      .map(([name, amount]) => ({ name, amount: amount / 100 }))
      .sort((a, b) => b.amount - a.amount);
    const months: string[] = [];
    for (
      let point = new Date(
        Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1),
      );
      point <= to;
      point = new Date(
        Date.UTC(point.getUTCFullYear(), point.getUTCMonth() + 1, 1),
      )
    )
      months.push(point.toISOString().slice(0, 7));
    const series = months.map((month) => ({
      month,
      spending:
        sum(
          expenses.filter((row) => row.date.toISOString().startsWith(month)),
        ) / 100,
      income:
        allIncomes
          .filter((row) => row.date.toISOString().startsWith(month))
          .reduce((sum, row) => sum + cents(row.amount), 0) / 100,
      categories: categoryTotals.map((category) => ({
        categoryId: category.id,
        amount:
          sum(
            expenses.filter(
              (row) =>
                row.categoryId === category.id &&
                row.date.toISOString().startsWith(month),
            ),
          ) / 100,
      })),
    }));
    let cumulative = 0;
    let previousCumulative = 0;
    const dailyMap = new Map<string, number>();
    for (const row of expenses) {
      const key = row.date.toISOString().slice(0, 10);
      dailyMap.set(key, (dailyMap.get(key) || 0) + signed(row));
    }
    const previousMap = new Map<string, number>();
    for (const row of previous) {
      const key = row.date.toISOString().slice(0, 10);
      previousMap.set(key, (previousMap.get(key) || 0) + signed(row));
    }
    const daily = Array.from({ length: days }, (_, index) => {
      const date = new Date(from.getTime() + index * 86400000)
        .toISOString()
        .slice(0, 10);
      const previousDate = new Date(previousFrom.getTime() + index * 86400000)
        .toISOString()
        .slice(0, 10);
      cumulative += dailyMap.get(date) || 0;
      previousCumulative += previousMap.get(previousDate) || 0;
      return {
        date,
        spending: cumulative / 100,
        previous: previousCumulative / 100,
      };
    });
    const completeMonths =
      from.getUTCDate() === 1 &&
      to.getUTCDate() ===
        new Date(
          Date.UTC(to.getUTCFullYear(), to.getUTCMonth() + 1, 0),
        ).getUTCDate();
    return {
      from: fromInput,
      to: toInput,
      scope,
      categoryId: categoryId || null,
      totals: {
        spending: spending / 100,
        income: income / 100,
        loan: loan / 100,
        surplus: surplus / 100,
        previous: previousSpending / 100,
        change: (spending - previousSpending) / 100,
      },
      previousFrom: previousFrom.toISOString().slice(0, 10),
      legacyCount: expenses.filter((row) => row.origin === 'LEGACY').length,
      categories: categoryTotals,
      merchants,
      series,
      daily,
      budgets,
      completeMonths,
      expenses,
      incomes: allIncomes,
    };
  }
}
