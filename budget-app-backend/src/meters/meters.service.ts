// src/meters/meters.service.ts
import { Injectable, NotFoundException } from '@nestjs/common'
import { PrismaService } from '../prisma.service'
import {CreateMeterTypeDto} from './dto/create-meter-type.dto';
import {UpdateMeterTypeDto} from './dto/update-meter-type.dto';
import { CreateMeterReadingDto } from './dto/create-meter-reading.dto';
import { UpdateMeterReadingDto } from './dto/update-meter-reading.dto';

@Injectable()
export class MetersService {
  constructor(private readonly prisma: PrismaService) {}

  // ======= MeterType CRUD =======
  createMeterType(data: CreateMeterTypeDto) {
    return this.prisma.meterType.create({
      data,
      include: { readings: true },
    })
  }

  findAllMeterTypes() {
    return this.prisma.meterType.findMany({
      include: { readings: true },
    })
  }

  async findMeterType(id: string) {
    const meterType = await this.prisma.meterType.findUnique({
      where: { id },
      include: { readings: true },
    })

    if (!meterType) {
      throw new NotFoundException(`MeterType with id ${id} not found`)
    }

    return meterType
  }

  async updateMeterType(id: string, data: UpdateMeterTypeDto) {
    await this.findMeterType(id)

    // Usuń przypadkowe readings, jeśli przyszło z frontendu
    const { readings, ...safeData } = data as any

    return this.prisma.meterType.update({
      where: { id },
      data: safeData,
      include: { readings: true }, // tylko do odczytu
    })
  }

  async removeMeterType(id: string) {
    await this.findMeterType(id)
    return this.prisma.meterType.delete({ where: { id } })
  }

  // ======= MeterReading CRUD =======
  createMeterReading(data: CreateMeterReadingDto) {
    return this.prisma.meterReading.create({
      data,
      include: { meter: true },
    })
  }

  findAllMeterReadings() {
    return this.prisma.meterReading.findMany({
      include: { meter: true },
      orderBy: { date: 'desc' },
    })
  }

  async findMeterReading(id: string) {
    const reading = await this.prisma.meterReading.findUnique({
      where: { id },
      include: { meter: true },
    })

    if (!reading) {
      throw new NotFoundException(`MeterReading with id ${id} not found`)
    }

    return reading
  }

  async updateMeterReading(id: string, data: UpdateMeterReadingDto) {
    await this.findMeterReading(id)

    // readings nie istnieje w DTO dla MeterReading, więc nie trzeba filtrować
    return this.prisma.meterReading.update({
      where: { id },
      data,
      include: { meter: true },
    })
  }

  async removeMeterReading(id: string) {
    await this.findMeterReading(id)
    return this.prisma.meterReading.delete({ where: { id } })
  }
}
