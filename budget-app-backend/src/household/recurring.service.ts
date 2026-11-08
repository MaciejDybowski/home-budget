import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { dateOnly, money, normalize, text } from './domain';
import {
  monthBounds,
  occurrenceAt,
  patternMatches,
  scheduledDates,
  validOccurrence,
} from './recurring.domain';

type Input = Record<string, any>;

@Injectable()
export class RecurringService {
  constructor(private readonly db: PrismaService) {}

  async save(input: Input, id?: string) {
    const type = input.type ?? 'SUBSCRIPTION';
    const status = input.status ?? 'ACTIVE';
    if (
      !['SUBSCRIPTION', 'FIXED'].includes(type) ||
      !['ACTIVE', 'PAUSED', 'ENDED'].includes(status)
    )
      throw new BadRequestException('Nieprawidłowy rodzaj lub status opłaty.');
    const intervalMonths = Number(input.intervalMonths);
    if (
      !Number.isInteger(intervalMonths) ||
      intervalMonths < 1 ||
      intervalMonths > 120
    )
      throw new BadRequestException('Cykl musi wynosić od 1 do 120 miesięcy.');
    const categoryId = input.categoryId || null;
    if (
      categoryId &&
      !(await this.db.category.findUnique({ where: { id: categoryId } }))
    )
      throw new BadRequestException('Nieznana kategoria.');
    let website: string | null = null;
    if (input.website) {
      try {
        const url = new URL(input.website);
        if (!['https:', 'http:'].includes(url.protocol)) throw new Error();
        website = url.toString();
      } catch {
        throw new BadRequestException(
          'Podaj pełny adres strony zaczynający się od https:// lub http://.',
        );
      }
    }
    const matchPattern = input.matchPattern
      ? normalize(text(input.matchPattern, 'fragment opisu'))
      : null;
    if (matchPattern && matchPattern.length < 3)
      throw new BadRequestException(
        'Fragment rozpoznawania musi mieć co najmniej 3 znaki.',
      );
    const data = {
      name: text(input.name, 'nazwa'),
      type,
      status,
      intervalMonths,
      categoryId,
      website,
      amount: money(input.amount),
      anchorDate: dateOnly(input.anchorDate),
      matchPattern,
      notes:
        String(input.notes ?? '')
          .trim()
          .slice(0, 1000) || null,
    };
    return id
      ? this.db.recurringCharge.update({ where: { id }, data })
      : this.db.recurringCharge.create({ data });
  }

  async overview(month: string) {
    const { from, to } = monthBounds(month);
    const charges = await this.db.recurringCharge.findMany({
      include: {
        category: true,
        payments: {
          include: { expense: { include: { category: true } } },
          orderBy: { dueDate: 'desc' },
        },
      },
      orderBy: { name: 'asc' },
    });
    const occurrences = charges
      .flatMap((charge) =>
        scheduledDates(charge, from, to).map((due) => ({
          chargeId: charge.id,
          dueDate: due.toISOString().slice(0, 10),
          amount: charge.amount.toString(),
          paymentId:
            charge.payments.find(
              (payment) => payment.dueDate.getTime() === due.getTime(),
            )?.id || null,
        })),
      )
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const yearFrom = new Date(Date.UTC(from.getUTCFullYear(), 0, 1));
    const yearTo = new Date(Date.UTC(from.getUTCFullYear(), 11, 31));
    const yearOccurrences = charges
      .flatMap((charge) =>
        scheduledDates(charge, yearFrom, yearTo).map((due) => ({
          chargeId: charge.id,
          dueDate: due.toISOString().slice(0, 10),
          amount: charge.amount.toString(),
          paymentId:
            charge.payments.find(
              (payment) => payment.dueDate.getTime() === due.getTime(),
            )?.id || null,
        })),
      )
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const today = dateOnly(
      new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Warsaw' }),
    );
    const next30 = new Date(today.getTime() + 29 * 86400000);
    const upcoming = charges
      .flatMap((charge) =>
        scheduledDates(charge, today, next30)
          .filter(
            (due) =>
              !charge.payments.some(
                (payment) => payment.dueDate.getTime() === due.getTime(),
              ),
          )
          .map((due) => ({
            chargeId: charge.id,
            dueDate: due.toISOString().slice(0, 10),
            amount: charge.amount.toString(),
          })),
      )
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const summary = (type?: string) => {
      const active = charges.filter(
        (charge) =>
          charge.status === 'ACTIVE' && (!type || charge.type === type),
      );
      const ids = new Set(active.map((charge) => charge.id));
      const monthly = active.reduce(
        (sum, charge) => sum.add(charge.amount.div(charge.intervalMonths)),
        new Prisma.Decimal(0),
      );
      const sum = (rows: { chargeId: string; amount: string }[]) =>
        rows
          .filter((row) => ids.has(row.chargeId))
          .reduce((total, row) => total.add(row.amount), new Prisma.Decimal(0))
          .toFixed(2);
      return {
        count: active.length,
        monthly: monthly.toFixed(2),
        yearly: monthly.mul(12).toFixed(2),
        scheduled: sum(occurrences),
        yearScheduled: sum(yearOccurrences),
        remaining: sum(occurrences.filter((row) => !row.paymentId)),
        next30: sum(upcoming),
      };
    };
    const unlinked = await this.db.expense.findMany({
      where: {
        kind: 'EXPENSE',
        chargePayment: null,
        date: {
          gte: new Date(from.getTime() - 21 * 86400000),
          lte: new Date(to.getTime() + 21 * 86400000),
        },
      },
      include: { category: true },
    });
    const suggestions = occurrences
      .filter((row) => !row.paymentId)
      .flatMap((row) => {
        const charge = charges.find((charge) => charge.id === row.chargeId)!;
        return unlinked
          .filter(
            (expense) =>
              patternMatches(charge, expense) &&
              Math.abs(
                expense.date.getTime() - dateOnly(row.dueDate).getTime(),
              ) <=
                21 * 86400000,
          )
          .map((expense) => ({
            chargeId: charge.id,
            dueDate: row.dueDate,
            expense,
            priceChanged: !expense.amount.equals(charge.amount),
          }));
      });
    return {
      charges: charges.map((charge) => ({
        ...charge,
        monthlyEquivalent: charge.amount.div(charge.intervalMonths).toFixed(2),
        yearlyEquivalent: charge.amount
          .mul(12)
          .div(charge.intervalMonths)
          .toFixed(2),
        nextDueDate:
          scheduledDates(
            charge,
            today,
            occurrenceAt(
              charge.anchorDate > today ? charge.anchorDate : today,
              charge.intervalMonths * (charge.payments.length + 2),
            ),
          )
            .find(
              (due) =>
                !charge.payments.some(
                  (payment) => payment.dueDate.getTime() === due.getTime(),
                ),
            )
            ?.toISOString()
            .slice(0, 10) || null,
      })),
      occurrences,
      yearOccurrences,
      upcoming,
      suggestions,
      totals: {
        all: summary(),
        subscriptions: summary('SUBSCRIPTION'),
        fixed: summary('FIXED'),
      },
    };
  }

  async candidates(chargeId: string, due: string) {
    const charge = await this.db.recurringCharge.findUnique({
      where: { id: chargeId },
    });
    if (!charge) throw new NotFoundException('Nie znaleziono opłaty.');
    const dueDate = dateOnly(due);
    if (!validOccurrence(charge, dueDate))
      throw new BadRequestException(
        'Termin nie należy do harmonogramu tej opłaty.',
      );
    const expenses = await this.db.expense.findMany({
      where: {
        kind: 'EXPENSE',
        chargePayment: null,
        date: {
          gte: new Date(dueDate.getTime() - 31 * 86400000),
          lte: new Date(dueDate.getTime() + 31 * 86400000),
        },
      },
      include: { category: true },
      orderBy: { date: 'desc' },
    });
    return expenses
      .map((expense) => ({
        ...expense,
        suggested: patternMatches(charge, expense),
        priceChanged: !expense.amount.equals(charge.amount),
      }))
      .sort((a, b) => Number(b.suggested) - Number(a.suggested));
  }

  async link(
    tx: Prisma.TransactionClient,
    chargeId: string,
    expenseId: string,
    due: string,
  ) {
    const dueDate = dateOnly(due);
    await tx.$queryRaw`SELECT "id" FROM "Expense" WHERE "id" = ${expenseId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "RecurringCharge" WHERE "id" = ${chargeId} FOR UPDATE`;
    const charge = await tx.recurringCharge.findUnique({
      where: { id: chargeId },
    });
    if (!charge) throw new NotFoundException('Nie znaleziono opłaty.');
    if (!validOccurrence(charge, dueDate))
      throw new BadRequestException(
        'Termin nie należy do harmonogramu tej opłaty.',
      );
    const expense = await tx.expense.findUnique({
      where: { id: expenseId },
      include: { chargePayment: true },
    });
    if (!expense || expense.kind !== 'EXPENSE')
      throw new BadRequestException(
        'Powiązać można wyłącznie istniejący wydatek.',
      );
    if (expense.chargePayment)
      throw new ConflictException('Ten wydatek jest już powiązany z opłatą.');
    return tx.chargePayment.create({ data: { chargeId, expenseId, dueDate } });
  }

  confirm(chargeId: string, input: Input) {
    return this.db.$transaction((tx) =>
      this.link(tx, chargeId, text(input.expenseId, 'wydatek'), input.dueDate),
    );
  }
}
