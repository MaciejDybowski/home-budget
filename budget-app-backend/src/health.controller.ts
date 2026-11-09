import { Controller, Get, Header } from '@nestjs/common';

@Controller('health')
export class HealthController {
  // Liveness only: periodic Render checks must not keep Neon compute awake.
  @Get()
  @Header('Cache-Control', 'no-store')
  check() {
    return { status: 'ok' };
  }
}
