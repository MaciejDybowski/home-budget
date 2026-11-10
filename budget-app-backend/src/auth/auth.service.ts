import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { Prisma, type AuthAccount } from '@prisma/client';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma.service';
import { AUTH_CONFIG, type AuthConfig } from './auth.config';

const lifetime = 7 * 24 * 60 * 60 * 1000;
const digest = (value: string) =>
  createHash('sha256').update(value).digest('hex');
const equal = (a: string, b: string) => {
  const first = Buffer.from(a),
    second = Buffer.from(b);
  return first.length === second.length && timingSafeEqual(first, second);
};

@Injectable()
export class AuthService implements OnModuleInit {
  private verifying = 0;
  constructor(
    private readonly db: PrismaService,
    @Inject(AUTH_CONFIG) readonly config: AuthConfig,
  ) {}

  async onModuleInit() {
    // Disabling auth must not resurrect sessions when auth is enabled again.
    if (!this.config.enabled) await this.db.authSession.deleteMany();
  }

  private name(kind: string) {
    return `${this.config.secure ? '__Host-' : ''}hb_${kind}`;
  }
  private cookie(req: Request, kind: string) {
    const prefix = this.name(kind) + '=';
    return (
      (req.headers.cookie || '')
        .split(';')
        .map((v) => v.trim())
        .find((v) => v.startsWith(prefix))
        ?.slice(prefix.length) || ''
    );
  }
  private options() {
    return {
      httpOnly: true,
      secure: this.config.secure,
      sameSite: 'lax' as const,
      path: '/',
    };
  }
  private csrf(req: Request, res: Response, rotate = false) {
    const existing = this.cookie(req, 'csrf');
    const token =
      !rotate && /^[a-f0-9]{64}$/.test(existing)
        ? existing
        : randomBytes(32).toString('hex');
    res.cookie(this.name('csrf'), token, {
      ...this.options(),
      maxAge: lifetime,
    });
    return token;
  }
  checkCsrf(req: Request) {
    const token = req.get('X-CSRF-Token') || '';
    if (
      req.get('Origin') !== this.config.origin ||
      !/^[a-f0-9]{64}$/.test(token) ||
      !equal(token, this.cookie(req, 'csrf'))
    ) {
      throw new ForbiddenException(
        'Nieprawidłowe zabezpieczenie żądania. Odśwież stronę.',
      );
    }
  }
  async session(req: Request, account?: AuthAccount | null) {
    if (account === undefined)
      account = await this.db.authAccount.findUnique({ where: { id: 1 } });
    if (!account) return null;
    const token = this.cookie(req, 'session');
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const session = await this.db.authSession.findUnique({
      where: { tokenHash: digest(token) },
    });
    return session &&
      session.version === account.version &&
      session.expiresAt.getTime() > Date.now()
      ? session
      : null;
  }
  async status(req: Request, res: Response) {
    if (!this.config.enabled) return { enabled: false, authenticated: false };
    const account = await this.db.authAccount.findUnique({ where: { id: 1 } });
    const session = await this.session(req, account);
    return {
      enabled: true,
      setupRequired: !account,
      authenticated: !!session,
      expiresAt: session?.expiresAt.toISOString(),
      csrfToken: this.csrf(req, res),
    };
  }
  async profile() {
    if (!this.config.enabled)
      throw new BadRequestException('Logowanie jest wyłączone.');
    const account = await this.db.authAccount.findUnique({ where: { id: 1 } });
    if (!account)
      throw new BadRequestException('Najpierw ustaw login i hasło.');
    return { username: account.username };
  }
  private async attempt(key: string, limit: number) {
    const now = new Date(),
      resetAt = new Date(now.getTime() + 15 * 60 * 1000);
    const rows = await this.db.$queryRaw<Array<{ attempts: number }>>`
      INSERT INTO "AuthAttempt" ("key", "attempts", "resetAt") VALUES (${key}, 1, ${resetAt})
      ON CONFLICT ("key") DO UPDATE SET
        "attempts" = CASE WHEN "AuthAttempt"."resetAt" <= ${now} THEN 1 ELSE "AuthAttempt"."attempts" + 1 END,
        "resetAt" = CASE WHEN "AuthAttempt"."resetAt" <= ${now} THEN ${resetAt} ELSE "AuthAttempt"."resetAt" END
      RETURNING "attempts"`;
    if (rows[0].attempts > limit)
      throw new HttpException(
        'Zbyt wiele prób logowania. Spróbuj za 15 minut.',
        429,
      );
  }
  async login(
    req: Request,
    res: Response,
    body: { username?: unknown; password?: unknown },
  ) {
    if (!this.config.enabled)
      throw new BadRequestException('Logowanie jest wyłączone.');
    const { username, password } = body || {};
    if (
      typeof username !== 'string' ||
      username.length > 64 ||
      typeof password !== 'string' ||
      Buffer.byteLength(password) > 1024 ||
      !password.length
    ) {
      throw new UnauthorizedException('Nieprawidłowy login lub hasło.');
    }
    // Count attempts durably BEFORE expensive hashing; no untrusted forwarded IP.
    await this.attempt('global', 100);
    await this.attempt(digest(req.socket.remoteAddress || 'unknown'), 10);
    const account = await this.db.authAccount.findUnique({ where: { id: 1 } });
    if (!account)
      throw new BadRequestException('Najpierw ustaw login i hasło.');
    if (this.verifying >= 2)
      throw new HttpException('Logowanie jest zajęte. Spróbuj ponownie.', 429);
    this.verifying++;
    let valid: boolean;
    try {
      valid = await argon2.verify(account.passwordHash, password);
    } finally {
      this.verifying--;
    }
    if (!valid || !equal(username, account.username))
      throw new UnauthorizedException('Nieprawidłowy login lub hasło.');
    const token = randomBytes(32).toString('hex'),
      expiresAt = new Date(Date.now() + lifetime);
    const old = this.cookie(req, 'session');
    await this.db.$transaction([
      this.db.authSession.deleteMany({
        where: {
          OR: [
            { expiresAt: { lte: new Date() } },
            { tokenHash: digest(old) },
            { version: { not: account.version } },
          ],
        },
      }),
      this.db.authSession.create({
        data: {
          tokenHash: digest(token),
          version: account.version,
          expiresAt,
        },
      }),
      this.db.authAttempt.deleteMany({
        where: { resetAt: { lt: new Date(Date.now() - lifetime) } },
      }),
    ]);
    res.cookie(this.name('session'), token, {
      ...this.options(),
      expires: expiresAt,
    });
    return {
      enabled: true,
      authenticated: true,
      setupRequired: false,
      expiresAt: expiresAt.toISOString(),
      csrfToken: this.csrf(req, res, true),
    };
  }
  async logout(req: Request, res: Response) {
    if (this.config.enabled)
      await this.db.authSession.deleteMany({
        where: { tokenHash: digest(this.cookie(req, 'session')) },
      });
    res.clearCookie(this.name('session'), this.options());
    return {
      enabled: this.config.enabled,
      authenticated: false,
      ...(this.config.enabled ? { csrfToken: this.csrf(req, res, true) } : {}),
    };
  }

  async setup(
    req: Request,
    res: Response,
    body: { username?: unknown; password?: unknown },
  ) {
    if (!this.config.enabled)
      throw new BadRequestException('Logowanie jest wyłączone.');
    if (await this.db.authAccount.findUnique({ where: { id: 1 } }))
      throw new ConflictException(
        'Konfiguracja logowania została już zakończona.',
      );
    const { username, password } = body || {};
    if (
      typeof username !== 'string' ||
      !/^[A-Za-z0-9._-]{1,64}$/.test(username)
    )
      throw new BadRequestException(
        'Login: użyj 1–64 liter, cyfr lub znaków . _ -',
      );
    if (
      typeof password !== 'string' ||
      [...password].length < 12 ||
      Buffer.byteLength(password) > 1024
    )
      throw new BadRequestException(
        'Hasło musi mieć co najmniej 12 znaków i najwyżej 1024 bajty.',
      );
    await this.attempt('setup', 10);
    if (this.verifying >= 2)
      throw new HttpException('Logowanie jest zajęte. Spróbuj ponownie.', 429);
    this.verifying++;
    let hash: string;
    try {
      hash = await argon2.hash(password, {
        type: argon2.argon2id,
        memoryCost: 32768,
        timeCost: 3,
        parallelism: 1,
        hashLength: 32,
      });
    } finally {
      this.verifying--;
    }
    try {
      // The singleton primary key is the lock: only one concurrent visitor wins.
      await this.db.authAccount.create({
        data: { id: 1, username, passwordHash: hash, version: randomUUID() },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException(
          'Konfiguracja logowania została już zakończona.',
        );
      throw error;
    }
    return this.login(req, res, { username, password });
  }

  async updateProfile(
    req: Request,
    res: Response,
    body: {
      username?: unknown;
      currentPassword?: unknown;
      newPassword?: unknown;
    },
  ) {
    if (!this.config.enabled)
      throw new BadRequestException('Logowanie jest wyłączone.');
    const { username, currentPassword, newPassword } = body || {};
    if (
      typeof username !== 'string' ||
      !/^[A-Za-z0-9._-]{1,64}$/.test(username)
    )
      throw new BadRequestException(
        'Login: użyj 1–64 liter, cyfr lub znaków . _ -',
      );
    if (
      typeof currentPassword !== 'string' ||
      !currentPassword.length ||
      Buffer.byteLength(currentPassword) > 1024
    )
      throw new BadRequestException('Podaj aktualne hasło.');
    if (
      newPassword !== undefined &&
      (typeof newPassword !== 'string' ||
        [...newPassword].length < 12 ||
        Buffer.byteLength(newPassword) > 1024)
    )
      throw new BadRequestException(
        'Hasło musi mieć co najmniej 12 znaków i najwyżej 1024 bajty.',
      );

    await this.attempt('global', 100);
    await this.attempt(digest(req.socket.remoteAddress || 'unknown'), 10);
    const account = await this.db.authAccount.findUnique({ where: { id: 1 } });
    if (!account)
      throw new BadRequestException('Najpierw ustaw login i hasło.');
    if (this.verifying >= 2)
      throw new HttpException('Logowanie jest zajęte. Spróbuj ponownie.', 429);
    this.verifying++;
    let valid: boolean;
    let passwordHash = account.passwordHash;
    try {
      valid = await argon2.verify(account.passwordHash, currentPassword);
      if (valid && typeof newPassword === 'string')
        passwordHash = await argon2.hash(newPassword, {
          type: argon2.argon2id,
          memoryCost: 32768,
          timeCost: 3,
          parallelism: 1,
          hashLength: 32,
        });
    } finally {
      this.verifying--;
    }
    if (!valid)
      throw new UnauthorizedException('Nieprawidłowe aktualne hasło.');

    const version = randomUUID();
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + lifetime);
    await this.db.$transaction(async (tx) => {
      const changed = await tx.authAccount.updateMany({
        where: { id: 1, version: account.version },
        data: { username, passwordHash, version },
      });
      if (changed.count !== 1)
        throw new ConflictException('Profil zmienił się. Odśwież stronę.');
      await tx.authSession.deleteMany();
      await tx.authSession.create({
        data: {
          tokenHash: digest(token),
          version,
          expiresAt,
        },
      });
    });
    res.cookie(this.name('session'), token, {
      ...this.options(),
      expires: expiresAt,
    });
    return { username, expiresAt: expiresAt.toISOString() };
  }
}
