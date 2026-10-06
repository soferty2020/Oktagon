import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';

import { AuditContextInterceptor } from './audit-context.interceptor';
import { RequestContextService } from '../../shared/request-context.service';

/**
 * Тесты контекста аудита.
 *
 * Поводом стали два реальных промаха, найденных сквозным сценарием приемки:
 *
 * 1. `AuditContextInterceptor` не был зарегистрирован, и весь журнал писался без
 *    автора, IP и requestId;
 * 2. автор не проставлялся даже после регистрации: guards выполняются **до**
 *    интерсепторов, поэтому попытка записать автора в AuthGuard не находила
 *    открытый контекст.
 *
 * Оба случая давали пустого автора во всех записях — журнал, по которому нельзя
 * понять, кто внес изменение, для BR-007 бесполезен.
 */
describe('AuditContextInterceptor', () => {
  const contextFor = (request: Record<string, unknown>): ExecutionContext =>
    ({
      getType: () => 'http',
      switchToHttp: () => ({ getRequest: () => request }),
    }) as unknown as ExecutionContext;

  const next: CallHandler = { handle: () => of('ok') };

  it('открывает контекст с requestId, IP и user-agent', () => {
    const service = new RequestContextService();
    const interceptor = new AuditContextInterceptor(service);
    const request = {
      method: 'POST',
      url: '/api/v1/branches',
      requestId: 'req-1',
      headers: { 'user-agent': 'test-agent' },
      ip: '127.0.0.1',
    };

    let seen: Record<string, unknown> = {};
    interceptor.intercept(contextFor(request), {
      handle: () => {
        seen = service.current() as Record<string, unknown>;
        return of('ok');
      },
    });

    expect(seen).toMatchObject({
      requestId: 'req-1',
      ipAddress: '127.0.0.1',
      userAgent: 'test-agent',
    });
  });

  it('берет автора из request.user, заполненного guard-ом', () => {
    const service = new RequestContextService();
    const interceptor = new AuditContextInterceptor(service);
    // Guards выполняются раньше интерсепторов, поэтому пользователь уже есть.
    const request = {
      requestId: 'req-2',
      headers: {},
      user: { id: 'user-1' },
    };

    let seen: { actorUserId?: string | null } = {};
    interceptor.intercept(contextFor(request), {
      handle: () => {
        seen = service.current();
        return of('ok');
      },
    });

    expect(seen.actorUserId).toBe('user-1');
  });

  it('для анонимного запроса автор не заполняется', () => {
    const service = new RequestContextService();
    const interceptor = new AuditContextInterceptor(service);
    const request = { requestId: 'req-3', headers: {} };

    let seen: { actorUserId?: string | null } = {};
    interceptor.intercept(contextFor(request), {
      handle: () => {
        seen = service.current();
        return of('ok');
      },
    });

    // Вход и неудачный вход не имеют автора по своей природе: пользователь еще
    // не идентифицирован.
    expect(seen.actorUserId).toBeNull();
  });

  it('вне запроса контекст пуст, а patch не падает', () => {
    const service = new RequestContextService();

    expect(service.current()).toEqual({});
    // patch вне HTTP-запроса не должен бросать: аудит может писаться из фоновой
    // задачи, где контекста нет.
    expect(() => service.patch({ actorUserId: 'user-1' })).not.toThrow();
  });

  it('не http-контекст пропускается без открытия контекста', () => {
    const service = new RequestContextService();
    const interceptor = new AuditContextInterceptor(service);
    const wsContext = {
      getType: () => 'ws',
      switchToHttp: () => {
        throw new Error('не должен вызываться');
      },
    } as unknown as ExecutionContext;

    expect(interceptor.intercept(wsContext, next)).toBeDefined();
    expect(service.current()).toEqual({});
  });
});
