// src/meters/meters.module.ts
import { Module } from '@nestjs/common'
import { MetersService } from './meters.service'
import { MetersController } from './meters.controller'

@Module({
  providers: [MetersService],
  controllers: [MetersController],
})
export class MetersModule {}
