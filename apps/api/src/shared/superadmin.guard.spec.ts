import type { ExecutionContext } from '@nestjs/common';

import { ApiException } from './api-exception';
import { PermissionResolver } from './permissions.guard';
import { SuperadminGuard } from './superadmin.guard';

describe('SuperadminGuard', () => {
  const contextFor = (user?: { id: string; role?: string }) =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  const buildGuard = (role: string | null) => {
    const resolver = {
      getPermissions: jest.fn(),
      getRole: jest.fn().mockResolvedValue(role ?? ''),
    } as unknown as jest.Mocked<PermissionResolver>;

    return { guard: new SuperadminGuard(resolver), resolver };
  };

  it('пропускает суперадминистратора', async () => {
    const { guard } = buildGuard('SUPERADMIN');

    await expect(guard.canActivate(contextFor({ id: 'user-1' }))).resolves.toBe(true);
  });

  it('не пропускает сотрудника даже с выданными правами', async () => {
    // Ключевое требование docs/26-admin-settings.md: право не делегируется.
    // Проверка идет по роли, поэтому grants не участвуют вовсе.
    const { guard } = buildGuard('STAFF');

    await expect(guard.canActivate(contextFor({ id: 'user-1' }))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('не пропускает участника клуба', async () => {
    const { guard } = buildGuard('MEMBER');

    await expect(guard.canActivate(contextFor({ id: 'user-1' }))).rejects.toBeInstanceOf(
      ApiException,
    );
  });

  it('требует аутентификации', async () => {
    const { guard } = buildGuard('SUPERADMIN');

    await expect(guard.canActivate(contextFor(undefined))).rejects.toThrow(
      'Пользователь не аутентифицирован',
    );
  });

  it('читает роль из источника, а не из токена', async () => {
    const { guard, resolver } = buildGuard('STAFF');
    // Роль в токене могла остаться прежней; guard обязан спросить источник.
    const context = contextFor({ id: 'user-1', role: 'SUPERADMIN' });

    await expect(guard.canActivate(context)).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(resolver.getRole).toHaveBeenCalledWith('user-1');
  });
});
