import { AsyncLocalStorage } from 'node:async_hooks';

import { Injectable } from '@nestjs/common';
import type { AuditContext } from '@octagon/contracts';

/**
 * Контекст текущего HTTP-запроса.
 *
 * Хранит то, что не хочется протаскивать через аргументы каждого метода:
 * идентификатор запроса, IP и user-agent (docs/08-database.md, поля AuditLog).
 * actorUserId проставляет аутентификация, когда появится модуль auth.
 *
 * Реализовано через AsyncLocalStorage: значения привязаны к цепочке
 * асинхронных вызовов, поэтому параллельные запросы не перемешиваются.
 */
@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<AuditContext>();

  /** Выполняет функцию внутри контекста запроса. */
  run<T>(context: AuditContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  /** Возвращает контекст текущего запроса или пустой объект вне запроса. */
  current(): AuditContext {
    return this.storage.getStore() ?? {};
  }

  /** Дополняет контекст текущего запроса (например, actorUserId после входа). */
  patch(values: AuditContext): void {
    const current = this.storage.getStore();
    if (!current) {
      return;
    }
    Object.assign(current, values);
  }

  get requestId(): string | undefined {
    return this.current().requestId ?? undefined;
  }

  get actorUserId(): string | null | undefined {
    return this.current().actorUserId;
  }
}
