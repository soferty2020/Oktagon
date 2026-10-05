'use server';

import { redirect } from 'next/navigation';

import { apiBaseUrl, clearTokens, saveTokens } from '@/lib/server/session';

export interface LoginState {
  error?: string;
}

/**
 * Вход в админку.
 *
 * Учетные данные уходят на backend, а полученные токены сохраняются в
 * httpOnly-cookie: клиентский код их не видит.
 */
export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');

  if (!email || !password) {
    return { error: 'Укажите email и пароль' };
  }

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
    });
  } catch {
    return { error: 'Backend API недоступен. Проверьте, что приложение запущено.' };
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { message?: string } | null;
    return { error: body?.message ?? 'Не удалось войти' };
  }

  const session = (await response.json()) as { accessToken?: string; refreshToken?: string };
  if (!session.accessToken || !session.refreshToken) {
    return { error: 'Backend вернул неполный ответ' };
  }

  await saveTokens({ accessToken: session.accessToken, refreshToken: session.refreshToken });
  redirect('/');
}

/** Выход: отзывает refresh-токен на backend и очищает cookie. */
export async function logoutAction(): Promise<void> {
  const { readTokens } = await import('@/lib/server/session');
  const { refreshToken } = await readTokens();

  if (refreshToken) {
    await fetch(`${apiBaseUrl()}/auth/logout`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    }).catch(() => undefined);
  }

  await clearTokens();
  redirect('/login');
}
