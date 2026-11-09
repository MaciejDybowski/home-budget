import { Body, Controller, Get, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from './public';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}
  @Public()
  @Post('setup')
  setup(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: { username?: unknown; password?: unknown },
  ) {
    return this.auth.setup(req, res, body);
  }
  @Public()
  @Get('status')
  status(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.status(req, res);
  }
  @Public()
  @Post('login')
  login(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: { username?: unknown; password?: unknown },
  ) {
    return this.auth.login(req, res, body);
  }
  @Public()
  @Post('logout')
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(req, res);
  }
}
