import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CsvImportService } from './csv-import.service';

@Controller('household/csv')
export class CsvImportController {
  constructor(private readonly service: CsvImportService) {}

  @Get(':accountId/templates') templates(
    @Param('accountId') accountId: string,
  ) {
    return this.service.templates(accountId);
  }
  @Post(':accountId/templates') save(
    @Param('accountId') accountId: string,
    @Body() input: Record<string, unknown>,
  ) {
    return this.service.saveTemplate(accountId, input);
  }
  @Delete(':accountId/templates/:id') remove(
    @Param('accountId') accountId: string,
    @Param('id') id: string,
  ) {
    return this.service.deleteTemplate(accountId, id);
  }

  @Post(':action')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
        fieldSize: 5 * 1024 * 1024,
      },
    }),
  )
  upload(
    @Param('action') action: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: Record<string, string>,
  ) {
    if (!file?.buffer || !body.accountId)
      throw new BadRequestException('Wybierz plik i konto.');
    let input: Record<string, unknown>;
    try {
      input = JSON.parse(body.input || '{}') as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Nieprawidłowe ustawienia importu.');
    }
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new BadRequestException('Nieprawidłowe ustawienia importu.');
    switch (action) {
      case 'inspect': {
        if (
          input.settings !== undefined &&
          (!input.settings ||
            typeof input.settings !== 'object' ||
            Array.isArray(input.settings))
        )
          throw new BadRequestException('Nieprawidłowe ustawienia odczytu.');
        return this.service.inspect(
          file.buffer,
          body.accountId,
          input.settings as Record<string, unknown> | undefined,
        );
      }
      case 'preview':
        return this.service.preview(file.buffer, body.accountId, input.config);
      case 'commit':
        return this.service.commit(
          file.buffer,
          body.accountId,
          file.originalname,
          input,
        );
      default:
        throw new BadRequestException('Nieznana operacja CSV.');
    }
  }
}
