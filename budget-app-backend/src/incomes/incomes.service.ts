import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateIncomeDto } from './dto/create-income.dto';
import { UpdateIncomeDto } from './dto/update.income.dto';

@Injectable()
export class IncomesService {
  constructor(private prisma: PrismaService) {}

  create(data: CreateIncomeDto) {
    return this.prisma.income.create({
      data,
      include: { source: true },
    });
  }

  findAll() {
    return this.prisma.income.findMany({
      include: { source: true },
      orderBy: { date: 'desc' },
    });
  }

  async findOne(id: string) {
    const income = await this.prisma.income.findUnique({
      where: { id },
      include: { source: true },
    });

    if (!income) {
      throw new NotFoundException(`Income with id ${id} not found`);
    }

    return income;
  }

  async update(id: string, data: UpdateIncomeDto) {
    await this.findOne(id); // upewnij się, że istnieje

    return this.prisma.income.update({
      where: { id },
      data,
      include: { source: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id); // upewnij się, że istnieje

    return this.prisma.income.delete({
      where: { id },
    });
  }
}
