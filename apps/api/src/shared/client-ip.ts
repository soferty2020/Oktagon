import type { Request } from 'express';

/**
 * Адрес клиента для rate limiting и аудита (#49, SEC-04).
 *
 * Раньше каждый модуль читал `X-Forwarded-For` и брал **первый** элемент — то
 * есть значение, которое прислал сам клиент. Nginx дописывал реальный адрес в
 * конец, поэтому подменой заголовка можно было обойти лимиты входа и записать в
 * аудит чужой IP.
 *
 * Теперь источник один: `request.ip`. Его считает Express с `trust proxy`,
 * настроенным в `main.ts` на один хоп — nginx. Nginx перезаписывает
 * `X-Forwarded-For` адресом соединения (`$remote_addr`), а не дописывает
 * клиентский заголовок, поэтому подделать адрес снаружи нельзя.
 */
export function clientIp(request: Request): string | null {
  const ip = request.ip ?? request.socket?.remoteAddress ?? null;
  return normalizeIp(ip);
}

/** IPv4-адрес из IPv6-обёртки (`::ffff:1.2.3.4`) и пустая строка → null. */
function normalizeIp(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed === '' || trimmed === '::1') {
    return trimmed === '::1' ? '127.0.0.1' : null;
  }

  return trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
}
