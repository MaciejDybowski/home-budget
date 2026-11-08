import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import { CreateSourceDto } from './dto/create-source.dto'

@Injectable()
export class SourcesService {
  constructor(private prisma: PrismaService) {}

  create(data: CreateSourceDto) {
    return this.prisma.incomeSource.create({ data })
  }

  findAll() {
    return this.prisma.incomeSource.findMany()
  }
}
