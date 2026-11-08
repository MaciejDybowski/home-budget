import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class DatabaseErrorsFilter implements ExceptionFilter {
  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      error.code === 'P2025'
        ? 404
        : ['P2002', 'P2003'].includes(error.code)
          ? 409
          : 500;
    const message =
      error.code === 'P2002'
        ? 'Taki wpis już istnieje.'
        : error.code === 'P2003'
          ? 'Ten wpis jest powiązany z innymi danymi. Najpierw usuń powiązania.'
          : error.code === 'P2025'
            ? 'Nie znaleziono wpisu.'
            : 'Nie udało się zapisać danych.';
    if (status === 500) console.error(error);
    response.status(status).json({ statusCode: status, message });
  }
}
