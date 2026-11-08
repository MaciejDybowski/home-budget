// src/meters/meters.controller.ts
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common'
import { MetersService } from './meters.service'
import {CreateMeterTypeDto} from './dto/create-meter-type.dto';
import {UpdateMeterTypeDto} from './dto/update-meter-type.dto';
import { CreateMeterReadingDto } from './dto/create-meter-reading.dto';
import { UpdateMeterReadingDto } from './dto/update-meter-reading.dto';

@Controller('meters')
export class MetersController {
  constructor(private readonly metersService: MetersService) {}

  // ===== MeterType endpoints =====
  @Post('types')
  createMeterType(@Body() data: CreateMeterTypeDto) {
    return this.metersService.createMeterType(data)
  }

  @Get('types')
  findAllMeterTypes() {
    return this.metersService.findAllMeterTypes()
  }

  @Get('types/:id')
  findMeterType(@Param('id', ParseUUIDPipe) id: string) {
    return this.metersService.findMeterType(id)
  }

  @Patch('types/:id')
  updateMeterType(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdateMeterTypeDto,
  ) {
    return this.metersService.updateMeterType(id, data)
  }

  @Delete('types/:id')
  removeMeterType(@Param('id', ParseUUIDPipe) id: string) {
    return this.metersService.removeMeterType(id)
  }

  // ===== MeterReading endpoints =====
  @Post('readings')
  createMeterReading(@Body() data: CreateMeterReadingDto) {
    return this.metersService.createMeterReading(data)
  }

  @Get('readings')
  findAllMeterReadings() {
    return this.metersService.findAllMeterReadings()
  }

  @Get('readings/:id')
  findMeterReading(@Param('id', ParseUUIDPipe) id: string) {
    return this.metersService.findMeterReading(id)
  }

  @Patch('readings/:id')
  updateMeterReading(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() data: UpdateMeterReadingDto,
  ) {
    return this.metersService.updateMeterReading(id, data)
  }

  @Delete('readings/:id')
  removeMeterReading(@Param('id', ParseUUIDPipe) id: string) {
    return this.metersService.removeMeterReading(id)
  }
}
