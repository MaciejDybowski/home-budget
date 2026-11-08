import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateCategoryPatternDto } from './dto/create-pattern.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  // --- Kategorie ---
  async create(data: CreateCategoryDto) {
    return this.prisma.category.create({ data });
  }

  async findAll() {
    return this.prisma.category.findMany({
      include: {
        patterns: true,
      },
    });
  }

  async updateCategory(id: string, data: Partial<CreateCategoryDto>) {
    return this.prisma.category.update({
      where: { id },
      data,
    });
  }

  async deleteCategory(id: string) {
    return this.prisma.$transaction(async (prisma) => {
      if (await prisma.expense.count({ where: { categoryId: id } })) {
        throw new ConflictException('Kategoria ma transakcje. Przenieś je do innej kategorii przed usunięciem.');
      }
      await prisma.categoryPattern.deleteMany({ where: { categoryId: id } });
      return prisma.category.delete({ where: { id } });
    });
  }

  // --- Patterny ---
  async addPattern(data: CreateCategoryPatternDto) {
    return this.prisma.categoryPattern.create({
      data: {
        pattern: data.pattern,
        categoryId: data.categoryId,
      },
    });
  }

  async updatePattern(id: string, pattern: string) {
    return this.prisma.categoryPattern.update({
      where: { id },
      data: { pattern },
    });
  }

  async deletePattern(id: string) {
    return this.prisma.categoryPattern.delete({ where: { id } });
  }

  async getPatterns() {
    return this.prisma.categoryPattern.findMany({
      include: { category: true },
    });
  }
}
