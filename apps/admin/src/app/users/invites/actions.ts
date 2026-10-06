'use server';

import { revalidatePath } from 'next/cache';

import { apiBaseUrl, apiFetch, type ApiFailure } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';

export interface InviteFormState {
  error?: string;
  /** Токен показывается один раз: в БД хранится только его хеш. */
  token?: string;
  email?: string;
  role?: string;
  expiresAt?: string;
}

export interface AcceptInviteState {
  error?: string;
  accepted?: { email: string; role: string };
}

/**
 * Создание приглашения (B3).
 *
 * Провайдер доставки письма не выбран (docs/25-open-questions.md), поэтому
 * ссылку с токеном администратор передает вручную. Токен возвращается один раз —
 * в ответе на создание; повторно его получить нельзя ни из списка, ни из БД.
 */
export async function createInviteAction(
  _prev: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Сессия истекла, войдите заново' };
  }

  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const role = String(formData.get('role') ?? '').trim();

  if (!email) {
    return { error: 'Укажите email' };
  }
  if (!role) {
    return { error: 'Выберите роль' };
  }

  const { accessToken } = await readTokens();
  if (!accessToken) {
    return { error: 'Сессия истекла, войдите заново' };
  }

  const result = await apiFetch<{
    token: string;
    email: string;
    role: string;
    expiresAt: string;
  }>('/users/invites', {
    accessToken,
    method: 'POST',
    body: { email, role },
  });

  if (!result.ok) {
    return { error: describeInviteError(result.error) };
  }

  // Обновляем и список приглашений, и список пользователей: приглашенный уже
  // создан со статусом INVITED, и администратор ждет его увидеть.
  revalidatePath('/users/invites');
  revalidatePath('/users');

  return {
    token: result.data.token,
    email: result.data.email,
    role: result.data.role,
    expiresAt: result.data.expiresAt,
  };
}

/**
 * Принятие приглашения: приглашенный задает пароль и профиль.
 *
 * Выполняется без сессии — аккаунта еще нет, а роль и email берутся из самого
 * приглашения на backend, поэтому подменить их через форму нельзя.
 */
export async function acceptInviteAction(
  _prev: AcceptInviteState,
  formData: FormData,
): Promise<AcceptInviteState> {
  const token = String(formData.get('token') ?? '').trim();
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase();
  const password = String(formData.get('password') ?? '');
  const passwordRepeat = String(formData.get('passwordRepeat') ?? '');
  const firstName = String(formData.get('firstName') ?? '').trim();
  const lastName = String(formData.get('lastName') ?? '').trim();
  const middleName = String(formData.get('middleName') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();

  if (!token) {
    return { error: 'Ссылка приглашения неполная: запросите новую у администратора' };
  }
  if (!email || !firstName || !lastName) {
    return { error: 'Укажите email, имя и фамилию' };
  }
  if (password.length < 8) {
    return { error: 'Пароль должен быть не короче 8 символов' };
  }
  if (password !== passwordRepeat) {
    return { error: 'Пароли не совпадают' };
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/auth/accept-invite`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        token,
        email,
        password,
        firstName,
        lastName,
        ...(middleName ? { middleName } : {}),
        ...(phone ? { phone } : {}),
      }),
      cache: 'no-store',
    });
  } catch {
    return { error: 'Backend API недоступен. Проверьте, что приложение запущено.' };
  }

  const payload = (await response.json().catch(() => null)) as {
    email?: string;
    role?: string;
    code?: string;
    message?: string;
    details?: unknown;
  } | null;

  if (!response.ok) {
    return { error: describeAcceptInviteError(response.status, payload) };
  }

  return {
    accepted: {
      email: payload?.email ?? email,
      role: payload?.role ?? '',
    },
  };
}

/**
 * Понятные тексты ошибок приглашения.
 *
 * Основные случаи объясняются своими словами: администратору важно сразу понять,
 * что делать — например, что адрес уже занят или что приглашение надо выписать
 * заново.
 */
function describeInviteError(error: ApiFailure): string {
  switch (error.code) {
    case 'EMAIL_ALREADY_EXISTS':
      return 'Пользователь с таким email уже существует: приглашение не нужно';
    case 'FORBIDDEN':
      return 'Недостаточно прав: приглашать может только пользователь с правом «users.manage»';
    case 'SERVICE_UNAVAILABLE':
      return 'Backend API недоступен. Проверьте, что он запущен.';
    case 'VALIDATION_FAILED':
      return 'Проверьте адрес: он должен быть корректным email';
    default:
      return error.message;
  }
}

function describeAcceptInviteError(
  status: number,
  payload: { code?: string; message?: string; details?: unknown } | null,
): string {
  switch (payload?.code) {
    case 'INVITE_INVALID':
      return 'Приглашение недействительно: возможно, его перевыпустили. Запросите новую ссылку.';
    case 'INVITE_EXPIRED':
      return 'Срок приглашения истек: запросите новое у администратора';
    case 'INVITE_EMAIL_MISMATCH':
      return 'Приглашение выдано на другой email: проверьте адрес';
    case 'INVITE_ALREADY_USED':
      return 'Приглашение уже использовано: если пароль забыт, войдите или запросите новое приглашение';
    case 'RATE_LIMITED':
      return 'Слишком много попыток. Подождите минуту и попробуйте снова.';
    case 'SERVICE_UNAVAILABLE':
      return 'Backend API недоступен. Проверьте, что он запущен.';
    default:
      return payload?.message ?? `Не удалось принять приглашение (${status})`;
  }
}
