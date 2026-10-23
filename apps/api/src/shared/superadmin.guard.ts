import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';

import { ApiException } from './api-exception';
import type { AuthenticatedUser } from './auth-stub';
import { PermissionResolver } from './permissions.guard';

/** Роль, которой доступны настройки клуба и журнал действий. */
export const SUPERADMIN_ROLE = 'SUPERADMIN';

type RequestWithUser = Request & { user?: AuthenticatedUser };

/**
 * Пропускает только суперадминистратора.
 *
 * Проверяет **роль**, а не право: `docs/26-admin-settings.md` требует, чтобы
 * журнал действий и финансовые правила были недоступны сотруднику даже с
 * индивидуально выданными правами. Проверка права здесь пропустила бы STAFF с
 * grant'ом, поэтому используется отдельный guard.
 *
 * Роль читается из источника каждый раз, а не берется из токена (ADR-0006):
 * снятие роли должно действовать сразу, не дожидаясь истечения access-токена.
 */
@Injectable()
export class SuperadminGuard implements CanActivate {
  constructor(private readonly resolver: PermissionResolver) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    if (!request.user) {
      throw new UnauthorizedException('Пользователь не аутентифицирован');
    }

    const role = await this.resolver.getRole(request.user.id);
    if (role !== SUPERADMIN_ROLE) {
      throw new ApiException(
        'FORBIDDEN',
        'Раздел доступен только суперадминистратору: право не делегируется',
      );
    }

    return true;
  }
}
