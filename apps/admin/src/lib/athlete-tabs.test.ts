import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveAthleteTab, visibleAthleteTabs } from './athlete-tabs.ts';

/**
 * RBAC вкладок карточки (#UAT п.5).
 *
 * Без `payments.view` вкладка «Оплаты» не должна существовать ни в навигации,
 * ни при прямом переходе по ссылке — иначе пользователь видит пункт, который
 * ему закрыт, и получает отказ уже внутри.
 */
test('без payments.view вкладки «Оплаты» нет', () => {
  const keys = visibleAthleteTabs(false).map((tab) => tab.key);
  assert.equal(keys.includes('payments'), false);
  assert.equal(keys.includes('competitions'), true);
});

test('с payments.view вкладка «Оплаты» есть', () => {
  const keys = visibleAthleteTabs(true).map((tab) => tab.key);
  assert.equal(keys.includes('payments'), true);
});

test('прямой ?tab=payments без права открывает профиль', () => {
  assert.equal(resolveAthleteTab('payments', false), 'profile');
});

test('прямой ?tab=payments с правом открывает оплаты', () => {
  assert.equal(resolveAthleteTab('payments', true), 'payments');
});

test('неизвестная вкладка сводится к профилю', () => {
  assert.equal(resolveAthleteTab('unknown', true), 'profile');
  assert.equal(resolveAthleteTab(undefined, true), 'profile');
});
