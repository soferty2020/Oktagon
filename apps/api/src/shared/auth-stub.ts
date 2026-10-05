import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
  createParamDecorator,
} from '@nestjs/common';
import type { Request } from 'express';

/**
 * Аутентифицированный пользователь запроса.
 *
 * Пока модуль auth не реализован (issue B2), субъект берется из заголовка
 * `x-user-id`. Заголовок обрабатывается ТОЛЬКО при LOCAL_AUTH_STUB=true:
 * без явного включения все защищенные маршруты отвечают 401, поэтому
 * заглушка не может случайно попасть в staging или production.
 *
 * TODO(B2): заменить на проверку access-токена и удалить заглушку.
 */
export interface AuthenticatedUser {
  id: string;
}

type RequestWithUser = Request & { user?: AuthenticatedUser };

@Injectable()
export class StubAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.LOCAL_AUTH_STUB !== 'true') {
      throw new UnauthorizedException('Аутентификация не реализована (issue B2)');
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const header = request.headers['x-user-id'];
    const userId = typeof header === 'string' ? header.trim() : '';

    if (!userId) {
      throw new UnauthorizedException('Не указан заголовок x-user-id');
    }

    request.user = { id: userId };
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
