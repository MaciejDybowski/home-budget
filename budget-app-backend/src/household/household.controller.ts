import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { HouseholdService } from './household.service';
import { RecurringService } from './recurring.service';
import { AnalyticsService } from './analytics.service';
import { MerchantsService } from './merchants.service';

@Controller('household')
export class HouseholdController {
  constructor(
    private readonly service: HouseholdService,
    private readonly recurring: RecurringService,
    private readonly analytics: AnalyticsService,
    private readonly merchants: MerchantsService,
  ) {}

  @Get() state(@Query('month') month: string) {
    return this.service.state(month);
  }

  @Get('analytics') report(
    @Query('from') from: string,
    @Query('to') to: string,
    @Query('scope') scope?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return this.analytics.report(from, to, scope, categoryId);
  }

  @Get('merchants') catalog() {
    return this.merchants.list();
  }

  @Post('merchants/:id/merge') mergeMerchant(
    @Param('id') id: string,
    @Body() input: Record<string, unknown>,
  ) {
    return this.merchants.merge(id, input);
  }

  @Get('recurring/:id/candidates') candidates(
    @Param('id') id: string,
    @Query('dueDate') dueDate: string,
  ) {
    return this.recurring.candidates(id, dueDate);
  }

  @Post('recurring/:id/payments') confirmPayment(
    @Param('id') id: string,
    @Body() input: Record<string, any>,
  ) {
    return this.recurring.confirm(id, input);
  }

  @Post('import/:action')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
        fieldSize: 5 * 1024 * 1024,
      },
    }),
  )
  import(
    @Param('action') action: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: Record<string, string>,
  ) {
    if (!file?.buffer || !body.accountId)
      throw new BadRequestException('Wybierz plik i konto.');
    if (action === 'preview')
      return this.service.preview(file.buffer, body.accountId);
    if (action !== 'commit')
      throw new BadRequestException('Nieznana operacja importu.');
    let input: Record<string, any>;
    try {
      input = JSON.parse(body.decisions);
    } catch {
      throw new BadRequestException('Nieprawidłowe decyzje importu.');
    }
    if (!input || typeof input !== 'object')
      throw new BadRequestException('Nieprawidłowe decyzje importu.');
    return this.service.import(
      file.buffer,
      body.accountId,
      file.originalname,
      input,
    );
  }

  @Post('goals/:id/contributions') contribute(
    @Param('id') id: string,
    @Body() body: Record<string, any>,
  ) {
    return this.service.contribute(id, body);
  }
  @Put('budgets/:month') budget(
    @Param('month') month: string,
    @Body() body: Record<string, any>,
  ) {
    return this.service.saveBudget(month, body);
  }

  @Post(':entity') create(
    @Param('entity') entity: string,
    @Body() body: Record<string, any>,
  ) {
    return this.save(entity, body);
  }
  @Put(':entity/:id') update(
    @Param('entity') entity: string,
    @Param('id') id: string,
    @Body() body: Record<string, any>,
  ) {
    return this.save(entity, body, id);
  }
  @Delete(':entity/:id') remove(
    @Param('entity') entity: string,
    @Param('id') id: string,
  ) {
    return this.service.remove(entity, id);
  }

  private save(entity: string, body: Record<string, any>, id?: string) {
    if (!body || typeof body !== 'object')
      throw new BadRequestException('Brak danych.');
    switch (entity) {
      case 'merchants':
        return this.merchants.save(body, id);
      case 'expenses':
        return this.service.saveExpense(body, id);
      case 'incomes':
        return this.service.saveIncome(body, id);
      case 'categories':
        return this.service.saveCategory(body, id);
      case 'sources':
        return this.service.saveSource(body, id);
      case 'accounts':
        return this.service.saveAccount(body, id);
      case 'goals':
        return this.service.saveGoal(body, id);
      case 'meters':
        return this.service.saveMeter(body, id);
      case 'readings':
        return this.service.saveReading(body, id);
      case 'rules':
        return this.service.saveRule(body, id);
      case 'recurring':
        return this.recurring.save(body, id);
      default:
        throw new BadRequestException('Nieznany zasób.');
    }
  }
}
