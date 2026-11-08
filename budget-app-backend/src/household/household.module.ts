import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma.module';
import { HouseholdController } from './household.controller';
import { HouseholdService } from './household.service';
import { RecurringService } from './recurring.service';
import { AnalyticsService } from './analytics.service';
import { CsvImportService } from './csv-import.service';
import { CsvImportController } from './csv-import.controller';
import { MerchantsService } from './merchants.service';

@Module({
  imports: [PrismaModule],
  controllers: [HouseholdController, CsvImportController],
  providers: [
    HouseholdService,
    RecurringService,
    AnalyticsService,
    CsvImportService,
    MerchantsService,
  ],
})
export class HouseholdModule {}
