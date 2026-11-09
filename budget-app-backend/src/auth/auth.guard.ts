import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { PUBLIC_AUTH } from './public';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    context
      .switchToHttp()
      .getResponse<Response>()
      .setHeader('Cache-Control', 'no-store');
    if (!this.auth.config.enabled) return true;
    const publicRoute = this.reflector.getAllAndOverride<boolean>(PUBLIC_AUTH, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!publicRoute && !(await this.auth.session(req)))
      throw new UnauthorizedException('Sesja wygasła. Zaloguj się ponownie.');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method))
      this.auth.checkCsrf(req);
    return true;
  }
}
