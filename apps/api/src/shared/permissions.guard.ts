import {
  type CanActivate,
  type CustomDecorator,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { type PermissionCode, hasPermission, type UserPermissions } from '@octagon/contracts';

import { ApiException } from './api-exception';
import type { AuthenticatedUser } from './auth-stub';

export const REQUIRED_PERMISSIONS = 'required_permissions';

/**
 * Требует наличие permissions у текущего пользователя.
 *
 * Права берутся не из токена, а вычисляются на каждом запросе (ADR-0006):
 * иначе отзыв права не действовал бы до истечения access-токена. Guard
 * выполняется после AuthGuard: неаутентифицированный запрос получает 401, а не
 * 403 (docs/23-api-contract-plan.md).
 */
export const RequirePermissions = (...permissions: PermissionCode[]): CustomDecorator =>
  SetMetadata(REQUIRED_PERMISSIONS, permissions);

/**
 * Источник эффективных прав.
 *
 * Абстрактный класс, а не строка-токен: служит и типом, и DI-токеном, поэтому
 * не зависит от эмиссии параметр-декораторов.
 */
export abstract class PermissionResolver {
  abstract getPermissions(userId: string): Promise<UserPermissions>;
}

type RequestWithUser = Request & {
  user?: AuthenticatedUser;
  effectivePermissions?: UserPermissions;
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly resolver: PermissionResolver) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Права ищутся на методе, затем на классе контроллера. Без второго шага
    // `@RequirePermissions` на классе молча ничего не делал бы: маршрут
    // считался бы открытым, и это не заметно ни в тестах, ни в типах.
    const required =
      (Reflect.getMetadata(REQUIRED_PERMISSIONS, context.getHandler()) as
        PermissionCode[] | undefined) ??
      (Reflect.getMetadata(REQUIRED_PERMISSIONS, context.getClass()) as
        PermissionCode[] | undefined);

    // Маршрут без требования прав пропускается: guard можно вешать на весь
    // контроллер, а не на каждый метод.
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) {
      throw new UnauthorizedException('Пользователь не аутентифицирован');
    }

    const permissions =
      request.effectivePermissions ?? (await this.resolver.getPermissions(request.user.id));
    request.effectivePermissions = permissions;

    const missing = required.filter((permission) => !hasPermission(permissions, permission));
    if (missing.length > 0) {
      throw new ApiException('FORBIDDEN', 'Недостаточно прав для выполнения операции', {
        missingPermissions: missing,
      });
    }

    return true;
  }
}
