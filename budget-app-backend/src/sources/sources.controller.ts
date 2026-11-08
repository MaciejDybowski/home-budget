import { Controller, Get, Post, Body } from '@nestjs/common'
import { SourcesService } from './sources.service'
import { CreateSourceDto } from './dto/create-source.dto'

@Controller('sources')
export class SourcesController {
  constructor(private readonly sourcesService: SourcesService) {}

  @Post()
  create(@Body() data: CreateSourceDto) {
    return this.sourcesService.create(data)
  }

  @Get()
  findAll() {
    return this.sourcesService.findAll()
  }
}
