import { Controller, Get, Post, Patch, Delete, Body, Param } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CreateCategoryPatternDto } from './dto/create-pattern.dto';

@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  // --- Kategorie ---
  @Post()
  create(@Body() data: CreateCategoryDto) {
    return this.categoriesService.create(data);
  }

  @Get()
  findAll() {
    return this.categoriesService.findAll();
  }

  @Patch(':id')
  updateCategory(@Param('id') id: string, @Body() data: Partial<CreateCategoryDto>) {
    return this.categoriesService.updateCategory(id, data);
  }

  @Delete(':id')
  deleteCategory(@Param('id') id: string) {
    return this.categoriesService.deleteCategory(id);
  }

  // --- Patterny ---
  @Post('patterns')
  addPattern(@Body() data: CreateCategoryPatternDto) {
    return this.categoriesService.addPattern(data);
  }

  @Patch('patterns/:id')
  updatePattern(@Param('id') id: string, @Body() data: { pattern: string }) {
    return this.categoriesService.updatePattern(id, data.pattern);
  }

  @Delete('patterns/:id')
  deletePattern(@Param('id') id: string) {
    return this.categoriesService.deletePattern(id);
  }

  @Get('patterns')
  getPatterns() {
    return this.categoriesService.getPatterns();
  }
}
