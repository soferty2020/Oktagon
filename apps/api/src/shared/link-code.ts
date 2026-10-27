import { createHash, randomBytes } from 'node:crypto';

/**
 * Коды, которые человек вводит руками: приглашение (ADR-0014) и привязка
 * родителя к ребёнку (ADR-0015).
 *
 * Один алгоритм на оба: если бы каждый модуль генерировал по-своему, через
 * полгода коды отличались бы длиной и алфавитом, а хеши — нормализацией.
 */

/** Длина кода: его вводят с телефона, 8 символов — компромисс ввода и стойкости. */
export const LINK_CODE_LENGTH = 8;

/**
 * Алфавит без похожих символов: `0/O` и `1/I/L` не отличить на телефоне, а код
 * диктуют голосом или переписывают из мессенджера.
 */
export const LINK_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Генерирует код.
 *
 * `randomBytes` — криптостойкий источник: `Math.random` предсказуем, а код даёт
 * доступ к данным ребёнка.
 */
export function generateLinkCode(): string {
  const bytes = randomBytes(LINK_CODE_LENGTH);
  let code = '';

  for (let index = 0; index < LINK_CODE_LENGTH; index += 1) {
    code += LINK_CODE_ALPHABET[bytes[index] % LINK_CODE_ALPHABET.length];
  }

  return code;
}

/**
 * Хеш кода. Ввод нормализуется: пробелы, дефисы и регистр не должны решать,
 * сработает код или нет — человек вводит его с телефона.
 */
export function hashLinkCode(code: string): string {
  const normalized = code.replace(/[\s-]/g, '').toUpperCase();
  return createHash('sha256').update(normalized).digest('hex');
}
