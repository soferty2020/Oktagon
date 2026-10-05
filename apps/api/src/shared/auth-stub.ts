import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import type { Request } from 'express';

import { AccessTokenVerifier } from './access-token.verifier';

/**
 * Аутентифицированный пользователь запроса.
 *
 * `role` приходит из access-токена, но решения о доступе принимаются по
 * эффективным правам из IdentityService (ADR-0006): токен используется только
 * для идентификации.
 */
export interface AuthenticatedUser {
  id: string;
  email?: string;
  role?: string;
}

type RequestWithUser = Request & { user?: AuthenticatedUser };

/** Проверяет access-токен из заголовка `Authorization: Bearer <token>`. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly verifier: AccessTokenVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const header = request.headers.authorization;

    if (!header?.toLowerCase().startsWith('bearer ')) {
      throw new UnauthorizedException('Требуется access-токен');
    }

    const token = header.slice('bearer '.length).trim();
    const payload = await this.verifier.verify(token);
    if (!payload) {
      throw new UnauthorizedException('Access-токен недействителен или истек');
    }

    request.user = { id: payload.sub, email: payload.email, role: payload.role };
    return true;
  }
}

/** Достает аутентифицированного пользователя из запроса. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) {
      throw new UnauthorizedException('Пользователь не аутентифицирован');
    }
    return request.user;
  },
);
