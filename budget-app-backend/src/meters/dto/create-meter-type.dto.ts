// src/meters/dto/create-meter-type.dto.ts
export class CreateMeterTypeDto {
  name: string
  unit: string
  color?: string
  expectedMonthlyUsage?: number
}