import type { ExecutionContext } from '@nestjs/common';

import { PermissionsGuard, RequirePermissions, type PermissionResolver } from './permissions.guard';

/**
 * Тесты гарда прав.
 *
 * Поводом стал реальный промах: `@RequirePermissions` на классе контроллера
 * молча не работал, потому что гард читал метаданные только с метода. Молча —
 * значит маршрут оставался доступен всем аутентифицированным, и это не видно ни
 * в типах, ни в проверках отдельных сервисов. Здесь зафиксированы оба случая:
 * права на методе и права на классе.
 */
describe('PermissionsGuard', () => {
  /** Поддельный контекст: важны только класс, метод и запрос. */
  const contextFor = (
    handler: object,
    controller: object,
    user: { id: string } | undefined,
  ): ExecutionContext =>
    ({
      getHandler: () => handler,
      getClass: () => controller,
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  const resolverWith = (codes: string[]): PermissionResolver =>
    ({ getPermissions: jest.fn().mockResolvedValue({ codes }) }) as unknown as PermissionResolver;

  it('пропускает маршрут без требования прав', async () => {
    const guard = new PermissionsGuard(resolverWith([]));

    class Controller {}
    const allowed = await guard.canActivate(
      contextFor(() => undefined, Controller, { id: 'user-1' }),
    );

    expect(allowed).toBe(true);
  });

  it('требует права, указанные на методе', async () => {
    const guard = new PermissionsGuard(resolverWith([]));

    class Controller {
      @RequirePermissions('payments.view')
      handler(): void {}
    }

    await expect(
      guard.canActivate(contextFor(Controller.prototype.handler, Controller, { id: 'user-1' })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('требует права, указанные на классе контроллера', async () => {
    const guard = new PermissionsGuard(resolverWith([]));

    @RequirePermissions('chat.use')
    class Controller {
      handler(): void {}
    }

    // Без чтения метаданных класса маршрут считался бы открытым.
    await expect(
      guard.canActivate(contextFor(Controller.prototype.handler, Controller, { id: 'user-1' })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('права метода важнее прав класса', async () => {
    const guard = new PermissionsGuard(resolverWith(['chat.use']));

    @RequirePermissions('chat.use')
    class Controller {
      @RequirePermissions('payments.view')
      handler(): void {}
    }

    // На методе требуется payments.view, поэтому chat.use не спасает.
    await expect(
      guard.canActivate(contextFor(Controller.prototype.handler, Controller, { id: 'user-1' })),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('пропускает, когда право есть', async () => {
    const guard = new PermissionsGuard(resolverWith(['chat.use']));

    @RequirePermissions('chat.use')
    class Controller {
      handler(): void {}
    }

    const allowed = await guard.canActivate(
      contextFor(Controller.prototype.handler, Controller, { id: 'user-1' }),
    );

    expect(allowed).toBe(true);
  });

  it('неаутентифицированный запрос получает 401, а не 403', async () => {
    const guard = new PermissionsGuard(resolverWith([]));

    @RequirePermissions('chat.use')
    class Controller {
      handler(): void {}
    }

    await expect(
      guard.canActivate(contextFor(Controller.prototype.handler, Controller, undefined)),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('права вычисляются на каждом запросе, а не кешируются между вызовами', async () => {
    const resolver = resolverWith([]);
    const guard = new PermissionsGuard(resolver);

    @RequirePermissions('chat.use')
    class Controller {
      handler(): void {}
    }

    const context = contextFor(Controller.prototype.handler, Controller, { id: 'user-1' });
    await expect(guard.canActivate(context)).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // Второй вызов с теми же правами тоже обращается к источнику: иначе отзыв
    // права не действовал бы до истечения access-токена (ADR-0006).
    resolver.getPermissions = jest.fn().mockResolvedValue({ codes: ['chat.use'] });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });
});
