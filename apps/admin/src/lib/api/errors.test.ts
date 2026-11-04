import assert from 'node:assert/strict';
import { test } from 'node:test';

import { describeError } from './client.ts';

/**
 * Тексты ошибок API (#134).
 *
 * Проверяются контролируемые ответы, а не сбои staging: 403 и 500 должны давать
 * понятный человеку текст, а не «Ошибка 403» и не пустую строку. Формат ответа
 * — `{ code, message }`, как в контракте (docs/09-api.md).
 */
test('403 объясняет отсутствие прав', () => {
  assert.equal(
    describeError({ status: 403, code: 'FORBIDDEN', message: 'Forbidden' }),
    'Недостаточно прав для этого действия',
  );
});

test('401 просит войти заново', () => {
  assert.equal(
    describeError({ status: 401, code: 'UNAUTHENTICATED', message: 'Unauthorized' }),
    'Сессия истекла, войдите заново',
  );
});

test('500 отдаёт сообщение сервера, а не код', () => {
  const text = describeError({
    status: 500,
    code: 'INTERNAL_ERROR',
    message: 'Внутренняя ошибка сервера',
  });
  assert.equal(text, 'Внутренняя ошибка сервера');
  assert.equal(text.includes('500'), false);
});

test('неизвестный код не скрывает сообщение', () => {
  assert.equal(
    describeError({ status: 400, code: 'SOMETHING_NEW', message: 'Понятное объяснение' }),
    'Понятное объяснение',
  );
});
