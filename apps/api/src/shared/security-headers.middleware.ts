import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Заголовки безопасности для API (docs/15-security.md: HTTPS only in production).
 *
 * Реализовано без внешней зависимости: набор заголовков для JSON-API
 * фиксированный, и собственная реализация не тянет пакет ради семи строк.
 * Если понадобится CSP для отдачи HTML, вопрос стоит пересмотреть в пользу
 * проверенной библиотеки.
 *
 * Что закрывается:
 * - `X-Content-Type-Options: nosniff` — браузер не угадывает тип ответа, поэтому
 *   JSON не может быть исполнен как скрипт;
 * - `X-Frame-Options: DENY` — API нельзя встроить во фрейм (защита от
 *   clickjacking на страницах, которые его показывают);
 * - `Referrer-Policy: no-referrer` — адрес API не утекает сторонним сайтам;
 * - `Cross-Origin-Resource-Policy: same-site` — ответы не читаются чужими
 *   origin через сторонние встраивания;
 * - `Strict-Transport-Security` — только в production: в local и staging браузер
 *   по HTTP, и заголовок лишь запутал бы разработку.
 *
 * CSP здесь не ставится: API не отдает HTML, а `default-src 'none'` для JSON ничего
 * не добавляет. Страницы админки — отдельное приложение со своей политикой.
 */
@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  constructor(private readonly isProduction: boolean) {}

  use(_request: Request, response: Response, next: NextFunction): void {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-site');

    if (this.isProduction) {
      // Год и поддомены: без этого HTTPS можно понизить до HTTP.
      response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }

    next();
  }
}
