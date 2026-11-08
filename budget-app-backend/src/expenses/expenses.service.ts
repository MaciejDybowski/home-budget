import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { CreateExpenseDto } from './dto/create-expense.dto'
import { UpdateExpenseDto } from './dto/update-expense.dto'

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  create(data: CreateExpenseDto) {
    return this.prisma.expense.create({
      data,
      include: { category: true },
    })
  }

  findAll() {
    return this.prisma.expense.findMany({
      include: { category: true },
      orderBy: { date: 'desc' },
    })
  }

  async findOne(id: string) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: { category: true },
    })

    if (!expense) {
      throw new NotFoundException(`Expense with id ${id} not found`)
    }

    return expense
  }

  async update(id: string, data: UpdateExpenseDto) {
    await this.findOne(id)

    return this.prisma.expense.update({
      where: { id },
      data,
      include: { category: true },
    })
  }

  async remove(id: string) {
    await this.findOne(id)

    return this.prisma.expense.delete({
      where: { id },
    })
  }
}
