import { PartialType } from '@nestjs/mapped-types';
import { CreateMeterTypeDto } from './create-meter-type.dto';

export class UpdateMeterTypeDto extends PartialType(CreateMeterTypeDto) {}
