'use server';

import { revalidatePath } from 'next/cache';

import { apiFetch, type ApiFailure } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { parseAmount, parseCalendarDate, type FinanceFormState } from './finance-shared';

export type { FinanceFormState };

const SESSION_EXPIRED = 'Сессия истекла, войдите заново';

/**
 * Server actions финансов (эпик F).
 *
 * Спецификация: BR-001 (учет по календарным месяцам), BR-002 (произвольная
 * сумма), BR-003 (ручная отметка «оплачен полностью»), BR-005 (заморозка —
 * открытый период, даты можно вносить задним числом), BR-010 (только с явным
 * финансовым правом).
 *
 * Формы не скрывают операции без прав: окончательная проверка на backend, а
 * интерфейс лишь объясняет отказ. Иначе администратор искал бы причину в
 * собственном вводе.
 */
async function withSession(
  action: (
    accessToken: string,
  ) => Promise<{ ok: true; data: unknown } | { ok: false; error: ApiFailure }>,
  successMessage: string,
): Promise<FinanceFormState> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: SESSION_EXPIRED };
  }

  const { accessToken } = await readTokens();
  if (!accessToken) {
    return { error: SESSION_EXPIRED };
  }

  const result = await action(accessToken);
  if (!result.ok) {
    return { error: describeFinanceError(result.error) };
  }
  return { success: successMessage };
}

/** Необязательное текстовое поле: пустая строка не должна попадать в API. */
function optionalText(formData: FormData, name: string): string | undefined {
  const value = String(formData.get(name) ?? '').trim();
  return value === '' ? undefined : value;
}

function financePaths(athleteId?: string): string[] {
  const paths = ['/finance', '/finance/debtors', '/finance/freezes'];
  if (athleteId) {
    paths.push(`/finance/athletes/${athleteId}`);
  }
  return paths;
}

function revalidateFinance(athleteId?: string): void {
  // Все финансовые экраны показывают одни и те же данные: оплата меняет и
  // карточку спортсмена, и список должников, и сводку месяца.
  for (const path of financePaths(athleteId)) {
    revalidatePath(path);
  }
  // Не помешает и общей карточке спортсмена: заморозка видна и в справочнике.
  revalidatePath('/athletes');
}

// --- Расчетные периоды -------------------------------------------------------

/** Изменение ожидаемой суммы и заметки периода (BR-002). */
export async function updatePeriodAction(
  _prev: FinanceFormState,
  formData: FormData,
): Promise<FinanceFormState> {
  const periodId = String(formData.get('periodId') ?? '');
  const athleteId = String(formData.get('athleteId') ?? '');
  if (!periodId) {
    return { error: 'Не указан расчетный период' };
  }

  const expected = parseAmount(String(formData.get('expectedAmount') ?? ''));
  if (expected.error) {
    return { error: expected.error };
  }

  // Пустое поле означает «снять ожидание», а не «оставить прежнее»: иначе
  // ожидаемую сумму нельзя было бы убрать.
  const note = String(formData.get('note') ?? '').trim() || null;

  const state = await withSession(
    (accessToken) =>
      apiFetch(`/membership-periods/${periodId}`, {
        accessToken,
        method: 'PATCH',
        body: { expectedAmount: expected.value, note },
      }),
    'Ожидаемая сумма обновлена',
  );

  if (!state.error) {
    revalidateFinance(athleteId || undefined);
  }
  return state;
}

/** Ручная отметка «оплачен полностью» (BR-003). */
export async function markFullyPaidAction(
  _prev: FinanceFormState,
  formData: FormData,
): Promise<FinanceFormState> {
  const periodId = String(formData.get('periodId') ?? '');
  const athleteId = String(formData.get('athleteId') ?? '');
  const marked = String(formData.get('marked') ?? '') === 'true';

  if (!periodId) {
    return { error: 'Не указан расчетный период' };
  }

  const state = await withSession(
    (accessToken) =>
      apiFetch(`/membership-periods/${periodId}/fully-paid`, {
        accessToken,
        method: 'POST',
        body: { marked },
      }),
    marked ? 'Месяц отмечен оплаченным полностью' : 'Отметка снята',
  );

  if (!state.error) {
    revalidateFinance(athleteId || undefined);
  }
  return state;
}

// --- Оплаты ------------------------------------------------------------------

/**
 * Внесение оплаты произвольной суммы (BR-002).
 *
 * Ключ идемпотентности приходит из формы скрытым полем: он создается один раз
 * при монтировании формы, поэтому повторная отправка не создает вторую оплату, а
 * серверная и клиентская разметка не расходятся.
 */
export async function recordPaymentAction(
  _prev: FinanceFormState,
  formData: FormData,
): Promise<FinanceFormState> {
  const periodId = String(formData.get('periodId') ?? '');
  const athleteId = String(formData.get('athleteId') ?? '');
  if (!periodId) {
    return { error: 'Не указан расчетный период' };
  }

  const amount = parseAmount(String(formData.get('amount') ?? ''), { required: true });
  if (amount.error || amount.value === null) {
    return { error: amount.error ?? 'Укажите сумму оплаты' };
  }

  const paidAt = parseCalendarDate(String(formData.get('paidAt') ?? ''));
  if (paidAt.error) {
    return { error: paidAt.error };
  }

  const comment = optionalText(formData, 'comment');
  const idempotencyKey = optionalText(formData, 'idempotencyKey');

  const state = await withSession(
    (accessToken) =>
      apiFetch(`/membership-periods/${periodId}/payments`, {
        accessToken,
        method: 'POST',
        body: {
          amount: amount.value,
          method: String(formData.get('method') ?? 'CASH'),
          ...(paidAt.value ? { paidAt: paidAt.value } : {}),
          ...(comment ? { comment } : {}),
          ...(idempotencyKey ? { idempotencyKey } : {}),
        },
      }),
    'Оплата внесена',
  );

  if (!state.error) {
    revalidateFinance(athleteId || undefined);
  }
  return state;
}

/** Изменение внесенной оплаты: сумму вводят вручную и ошибаются. */
export async function updatePaymentAction(
  _prev: FinanceFormState,
  formData: FormData,
): Promise<FinanceFormState> {
  const paymentId = String(formData.get('paymentId') ?? '');
  const athleteId = String(formData.get('athleteId') ?? '');
  if (!paymentId) {
    return { error: 'Не указана оплата' };
  }

  const amount = parseAmount(String(formData.get('amount') ?? ''), { required: true });
  if (amount.error || amount.value === null) {
    return { error: amount.error ?? 'Укажите сумму оплаты' };
  }

  const paidAt = parseCalendarDate(String(formData.get('paidAt') ?? ''));
  if (paidAt.error) {
    return { error: paidAt.error };
  }

  const comment = String(formData.get('comment') ?? '').trim();

  const state = await withSession(
    (accessToken) =>
      apiFetch(`/payments/${paymentId}`, {
        accessToken,
        method: 'PATCH',
        body: {
          amount: amount.value,
          method: String(formData.get('method') ?? 'CASH'),
          ...(paidAt.value ? { paidAt: paidAt.value } : {}),
          // Пустая строка — осознанная очистка комментария, а не «не менять».
          comment,
        },
      }),
    'Оплата изменена',
  );

  if (!state.error) {
    revalidateFinance(athleteId || undefined);
  }
  return state;
}

/**
 * Отмена оплаты.
 *
 * Оплата удаляется, а период пересчитывается: ошибка ввода не должна оставаться
 * в истории как факт поступления денег. Кнопка отделена от «изменить» и требует
 * подтверждения, потому что действие необратимо.
 */
export async function voidPaymentAction(formData: FormData): Promise<void> {
  const paymentId = String(formData.get('paymentId') ?? '');
  const athleteId = String(formData.get('athleteId') ?? '');
  if (!paymentId) {
    return;
  }

  await withSession(
    (accessToken) => apiFetch(`/payments/${paymentId}`, { accessToken, method: 'DELETE' }),
    'Оплата отменена',
  );

  revalidateFinance(athleteId || undefined);
}

// --- Возвраты (ADR-0010) -----------------------------------------------------

/**
 * Оформляет возврат денег по периоду.
 *
 * Возврат не удаляет поступление: он фиксирует, что деньги были получены и
 * возвращены. Зачтенная сумма периода уменьшается, поэтому статус и
 * задолженность пересчитываются (ADR-0010).
 */
export async function refundPaymentAction(
  _prev: FinanceFormState,
  formData: FormData,
): Promise<FinanceFormState> {
  const periodId = String(formData.get('periodId') ?? '');
  const athleteId = String(formData.get('athleteId') ?? '');
  if (!periodId) {
    return { error: 'Не указан расчетный период' };
  }

  const amount = parseAmount(String(formData.get('amount') ?? ''), { required: true });
  if (amount.error || amount.value === null) {
    return { error: amount.error ?? 'Укажите сумму возврата' };
  }

  const refundedAt = parseCalendarDate(String(formData.get('refundedAt') ?? ''));
  if (refundedAt.error) {
    return { error: refundedAt.error };
  }

  const reason = optionalText(formData, 'reason');
  const paymentId = optionalText(formData, 'paymentId');
  const idempotencyKey = optionalText(formData, 'idempotencyKey');

  const state = await withSession(
    (accessToken) =>
      apiFetch(`/membership-periods/${periodId}/refunds`, {
        accessToken,
        method: 'POST',
        body: {
          amount: amount.value,
          ...(refundedAt.value ? { refundedAt: refundedAt.value } : {}),
          ...(reason ? { reason } : {}),
          ...(paymentId ? { paymentId } : {}),
          ...(idempotencyKey ? { idempotencyKey } : {}),
        },
      }),
    'Возврат оформлен',
  );

  if (!state.error) {
    revalidateFinance(athleteId || undefined);
  }
  return state;
}

/**
 * Отменяет ошибочно оформленный возврат.
 *
 * Возврат удаляется, период пересчитывается: возврат по ошибке не должен
 * уменьшать зачтенную сумму.
 */
export async function voidRefundAction(formData: FormData): Promise<void> {
  const refundId = String(formData.get('refundId') ?? '');
  const athleteId = String(formData.get('athleteId') ?? '');
  if (!refundId) {
    return;
  }

  await withSession(
    (accessToken) => apiFetch(`/refunds/${refundId}`, { accessToken, method: 'DELETE' }),
    'Возврат отменен',
  );

  revalidateFinance(athleteId || undefined);
}

// --- Заморозки (BR-005) ------------------------------------------------------

/** Открытие заморозки: дату начала можно внести задним числом. */
export async function openFreezeAction(
  _prev: FinanceFormState,
  formData: FormData,
): Promise<FinanceFormState> {
  const athleteId = String(formData.get('athleteId') ?? '');
  if (!athleteId) {
    return { error: 'Не указан спортсмен' };
  }

  const startedOn = parseCalendarDate(String(formData.get('startedOn') ?? ''));
  if (!startedOn.value) {
    return { error: startedOn.error ?? 'Укажите дату начала заморозки' };
  }

  const reason = optionalText(formData, 'reason');

  const state = await withSession(
    (accessToken) =>
      apiFetch(`/athletes/${athleteId}/freezes`, {
        accessToken,
        method: 'POST',
        body: {
          startedOn: startedOn.value,
          ...(reason ? { reason } : {}),
        },
      }),
    'Заморозка открыта',
  );

  if (!state.error) {
    revalidateFinance(athleteId);
  }
  return state;
}

/** Завершение заморозки: дату окончания тоже можно указать задним числом. */
export async function closeFreezeAction(
  _prev: FinanceFormState,
  formData: FormData,
): Promise<FinanceFormState> {
  const freezeId = String(formData.get('freezeId') ?? '');
  const athleteId = String(formData.get('athleteId') ?? '');
  if (!freezeId) {
    return { error: 'Не указана заморозка' };
  }

  const endedOn = parseCalendarDate(String(formData.get('endedOn') ?? ''));
  if (!endedOn.value) {
    return { error: endedOn.error ?? 'Укажите дату завершения заморозки' };
  }

  const state = await withSession(
    (accessToken) =>
      apiFetch(`/freezes/${freezeId}/close`, {
        accessToken,
        method: 'POST',
        body: { endedOn: endedOn.value },
      }),
    'Заморозка завершена',
  );

  if (!state.error) {
    revalidateFinance(athleteId || undefined);
  }
  return state;
}

function describeFinanceError(error: ApiFailure): string {
  switch (error.code) {
    case 'MEMBERSHIP_PERIOD_NOT_FOUND':
      return 'Расчетный период не найден: обновите страницу';
    case 'MEMBERSHIP_PERIOD_LOCKED':
      return 'Период закрыт: изменения по нему не принимаются';
    case 'PAYMENT_NOT_FOUND':
      return 'Оплата не найдена: возможно, ее уже отменили';
    case 'PAYMENT_AMOUNT_INVALID':
      return 'Сумма оплаты должна быть больше нуля';
    case 'REFUND_NOT_FOUND':
      return 'Возврат не найден: возможно, его уже отменили';
    case 'REFUND_EXCEEDS_PAYMENT':
      return 'Возврат больше, чем поступило по этому периоду';
    case 'REFUND_PAYMENT_MISMATCH':
      return 'Возврат относится к другому периоду либо его нельзя изменить: отмените и оформите заново';
    case 'PAYMENT_HAS_REFUNDS':
      return 'По оплате есть возвраты: сначала отмените их, потом удаляйте оплату';
    case 'FREEZE_ALREADY_OPEN':
      return 'У спортсмена уже есть открытая заморозка: сначала завершите ее';
    case 'FREEZE_NOT_OPEN':
      return 'Заморозка уже завершена либо не найдена';
    case 'FREEZE_PERIOD_INVALID':
      return 'Дата завершения раньше даты начала заморозки';
    case 'ATHLETE_NOT_FOUND':
      return 'Спортсмен не найден';
    case 'ATHLETE_ARCHIVED':
      return 'Карточка спортсмена архивирована';
    case 'FORBIDDEN':
      return 'Недостаточно прав для этого действия, либо спортсмен вне вашей зоны доступа';
    case 'VALIDATION_FAILED':
      return 'Проверьте введенные значения';
    case 'SERVICE_UNAVAILABLE':
      return 'Backend API недоступен. Проверьте, что он запущен.';
    default:
      return error.message;
  }
}
