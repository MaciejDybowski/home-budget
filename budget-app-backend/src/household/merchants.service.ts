import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { text } from './domain';

export const merchantName = (value: string) =>
  value.normalize('NFKC').trim().replace(/\s+/g, ' ');
export const merchantKey = (value: string) => merchantName(value).toLowerCase();
const processors = /\b(payu|paypro|autopay|przelewy24|paypal)\b/i;
const processorDomains = new Set([
  'payu.pl',
  'payu.com',
  'paypro.pl',
  'przelewy24.pl',
  'autopay.pl',
  'paypal.com',
]);

export function merchantAliases(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  const row = raw as Record<string, unknown>;
  const title = typeof row.title === 'string' ? row.title : '';
  const recipient =
    typeof row.counterparty === 'string' ? merchantName(row.counterparty) : '';
  const domains = [...title.matchAll(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/gi)]
    .map((match) => match[0].toLowerCase().replace(/^www\./, ''))
    .filter((domain) => !processorDomains.has(domain));
  const keys = domains.map((domain) => `domain:${domain}`);
  if (recipient.length >= 3 && !processors.test(recipient))
    keys.push(`recipient:${merchantKey(recipient)}`);
  return [...new Set(keys)];
}

@Injectable()
export class MerchantsService {
  constructor(private readonly db: PrismaService) {}

  list() {
    return this.db.merchant.findMany({
      include: {
        _count: { select: { expenses: true, aliases: true, rules: true } },
      },
      orderBy: [{ expenses: { _count: 'desc' } }, { name: 'asc' }],
    });
  }

  async resolve(tx: Prisma.TransactionClient, id: unknown, value: unknown) {
    if (id) {
      const merchantId = text(id, 'sklep');
      await tx.$queryRaw`SELECT "id" FROM "Merchant" WHERE "id" = ${merchantId} FOR UPDATE`;
      const record = await tx.merchant.findUnique({
        where: { id: merchantId },
      });
      if (!record)
        throw new BadRequestException('Nieznany sklep. Odśwież listę sklepów.');
      return { merchantId: record.id, merchant: record.name };
    }
    if (value == null || value === '')
      return { merchantId: null, merchant: null };
    const name = merchantName(text(value, 'nazwa sklepu'));
    const normalizedName = merchantKey(name);
    const record = await tx.merchant.upsert({
      where: { normalizedName },
      create: { name, normalizedName },
      update: {},
    });
    await tx.$queryRaw`SELECT "id" FROM "Merchant" WHERE "id" = ${record.id} FOR UPDATE`;
    const current = await tx.merchant.findUniqueOrThrow({
      where: { id: record.id },
    });
    return { merchantId: current.id, merchant: current.name };
  }

  async save(input: Record<string, unknown>, id?: string) {
    const name = merchantName(text(input.name, 'nazwa sklepu'));
    if (!id)
      return this.db.$transaction(async (tx) => {
        const resolved = await this.resolve(tx, null, name);
        return tx.merchant.findUniqueOrThrow({
          where: { id: resolved.merchantId! },
        });
      });
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Merchant" WHERE "id" = ${id} FOR UPDATE`;
      const duplicate = await tx.merchant.findUnique({
        where: { normalizedName: merchantKey(name) },
      });
      if (duplicate && duplicate.id !== id)
        throw new ConflictException(
          'Sklep o tej nazwie już istnieje. Wybierz go z katalogu.',
        );
      const merchant = await tx.merchant.update({
        where: { id },
        data: { name, normalizedName: merchantKey(name) },
      });
      // Keep old API clients and historical analytical grouping consistent too.
      await tx.expense.updateMany({
        where: { merchantId: id },
        data: { merchant: name },
      });
      await tx.merchantRule.updateMany({
        where: { merchantId: id },
        data: { merchant: name },
      });
      return merchant;
    });
  }

  async learn(
    tx: Prisma.TransactionClient,
    raw: unknown,
    merchantId: string | null,
    previousId?: string | null,
  ) {
    if (!merchantId) return;
    const keys = merchantAliases(raw);
    if (previousId && previousId !== merchantId)
      await tx.merchantAlias.deleteMany({
        where: { key: { in: keys }, merchantId: previousId },
      });
    for (const key of keys)
      await tx.merchantAlias.upsert({
        where: { key_merchantId: { key, merchantId } },
        create: { key, merchantId },
        update: {},
      });
  }

  async suggestions(rows: unknown[]) {
    const [catalog, aliases] = await Promise.all([
      this.db.merchant.findMany(),
      this.db.merchantAlias.findMany({
        where: { key: { in: [...new Set(rows.flatMap(merchantAliases))] } },
        include: { merchant: true },
      }),
    ]);
    return {
      catalog: new Map(
        catalog.map((merchant) => [merchant.normalizedName, merchant]),
      ),
      rows: rows.map((row) => {
        const keys = merchantAliases(row);
        const domainMatches = aliases.filter(
          (alias) =>
            keys.includes(alias.key) && alias.key.startsWith('domain:'),
        );
        const matches = domainMatches.length
          ? domainMatches
          : aliases.filter((alias) => keys.includes(alias.key));
        const merchants = new Map(
          matches.map((alias) => [alias.merchantId, alias.merchant]),
        );
        return {
          merchant: merchants.size === 1 ? [...merchants.values()][0] : null,
          ambiguous: merchants.size > 1,
        };
      }),
    };
  }

  async remove(id: string) {
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Merchant" WHERE "id" = ${id} FOR UPDATE`;
      if (!(await tx.merchant.findUnique({ where: { id } })))
        throw new NotFoundException('Nieznany sklep. Odśwież listę sklepów.');
      await this.reassign(tx, id, null);
      return tx.merchant.delete({ where: { id } });
    });
  }

  async merge(id: string, input: Record<string, unknown>) {
    const targetId = text(input?.targetId, 'sklep docelowy');
    if (id === targetId)
      throw new BadRequestException('Wybierz inny sklep docelowy.');
    return this.db.$transaction(async (tx) => {
      // A deterministic order also protects opposite concurrent merge requests.
      await tx.$queryRaw`SELECT "id" FROM "Merchant" WHERE "id" IN (${id}, ${targetId}) ORDER BY "id" FOR UPDATE`;
      const source = await tx.merchant.findUnique({ where: { id } });
      const target = await tx.merchant.findUnique({ where: { id: targetId } });
      if (!source || !target)
        throw new NotFoundException('Nieznany sklep. Odśwież listę sklepów.');
      await this.reassign(tx, id, target);
      const aliases = await tx.merchantAlias.findMany({
        where: { merchantId: id },
      });
      if (aliases.length)
        await tx.merchantAlias.createMany({
          data: aliases.map(({ key }) => ({ key, merchantId: targetId })),
          skipDuplicates: true,
        });
      await tx.merchant.delete({ where: { id } });
      return target;
    });
  }

  private async reassign(
    tx: Prisma.TransactionClient,
    id: string,
    target: { id: string; name: string } | null,
  ) {
    await tx.expense.updateMany({
      where: { merchantId: id },
      data: { merchantId: target?.id ?? null, merchant: target?.name ?? null },
    });
    // Category and operation-kind rules remain useful even without a store.
    await tx.merchantRule.updateMany({
      where: { merchantId: id },
      data: { merchantId: target?.id ?? null, merchant: target?.name ?? '' },
    });
    // Undoing an import must neither resurrect a deleted store nor lose a merge.
    await tx.$executeRaw`
      UPDATE "Expense"
      SET "raw" = jsonb_set("raw", '{manualOriginal}',
        ("raw"->'manualOriginal') || jsonb_build_object(
          'merchantId', ${target?.id ?? null}::text,
          'merchant', ${target?.name ?? null}::text))
      WHERE "raw" #>> '{manualOriginal,merchantId}' = ${id}`;
  }

  async prune(tx: Prisma.TransactionClient) {
    const [expenses, aliases] = await Promise.all([
      tx.expense.findMany({
        where: {
          origin: 'BANK',
          kind: { in: ['EXPENSE', 'REFUND'] },
          merchantId: { not: null },
        },
        select: { raw: true, merchantId: true },
      }),
      tx.merchantAlias.findMany(),
    ]);
    const supported = new Set(
      expenses.flatMap((expense) =>
        merchantAliases(expense.raw).map(
          (key) => `${key}\0${expense.merchantId}`,
        ),
      ),
    );
    const stale = aliases
      .filter((alias) => !supported.has(`${alias.key}\0${alias.merchantId}`))
      .map((alias) => alias.id);
    if (stale.length)
      await tx.merchantAlias.deleteMany({ where: { id: { in: stale } } });
  }
}
