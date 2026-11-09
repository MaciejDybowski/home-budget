import 'dotenv/config';
import { Module } from '@nestjs/common'

import { CategoriesModule } from './categories/categories.module';
import { SourcesModule } from './sources/sources.module';
import { ExpensesModule } from './expenses/expenses.module';
import { IncomesModule } from './incomes/incomes.module';
import { PrismaModule } from './prisma.module';
import { MetersModule } from './meters/meters.module';
import { HouseholdModule } from './household/household.module';
import { HealthController } from './health.controller';

@Module({
  controllers: [HealthController],
  imports: [
    PrismaModule,
    CategoriesModule,
    SourcesModule,
    ExpensesModule,
    IncomesModule,
    MetersModule,
    HouseholdModule,
  ],
})
export class AppModule {}
