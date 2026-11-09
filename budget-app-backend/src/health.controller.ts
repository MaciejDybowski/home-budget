import { Controller, Get, Header } from '@nestjs/common';
import { Public } from './auth/public';

@Controller('health')
@Public()
export class HealthController {
  // Liveness only: periodic Render checks must not keep Neon compute awake.
  @Get()
  @Header('Cache-Control', 'no-store')
  check() {
    return { status: 'ok' };
  }
}
