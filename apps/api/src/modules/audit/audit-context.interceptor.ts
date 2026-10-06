import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Observable } from 'rxjs';

import { RequestContextService } from '../../shared/request-context.service';

/**
 * Открывает контекст запроса на время его обработки: requestId, IP и
 * user-agent попадают в audit log (docs/08-database.md).
 *
 * Интерсептор должен выполняться после RequestIdInterceptor, чтобы requestId
 * был уже сгенерирован.
 */
@Injectable()
export class AuditContextInterceptor implements NestInterceptor {
  constructor(private readonly requestContext: RequestContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context
      .switchToHttp()
      .getRequest<Request & { requestId?: string; user?: { id: string } }>();

    return this.requestContext.run(
      {
        requestId: request.requestId ?? null,
        ipAddress: clientIp(request),
        userAgent: request.headers['user-agent'] ?? null,
        // Автор изменения берется из запроса: guards выполняются **до**
        // интерсепторов, поэтому к этому моменту `request.user` уже заполнен
        // AuthGuard. Проставлять автора в самом guard нельзя: контекст запроса
        // еще не открыт, и `patch` не находит хранилище (BR-007).
        actorUserId: request.user?.id ?? null,
      },
      () => next.handle(),
    );
  }
}

function clientIp(request: Request): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim() !== '') {
    const [first] = forwarded.split(',');
    if (first) {
      return first.trim();
    }
  }
  return request.ip ?? request.socket?.remoteAddress ?? null;
}
