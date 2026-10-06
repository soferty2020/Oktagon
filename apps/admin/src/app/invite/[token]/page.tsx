import Link from 'next/link';

import { apiFetch } from '@/lib/api/client';
import { AcceptInviteForm } from './accept-invite-form';

export const metadata = {
  title: 'Приглашение — OCTAGON',
};

interface UserInvitePreview {
  email: string;
  role: string;
  expiresAt: string;
}

/**
 * Принятие приглашения.
 *
 * Страница публичная: у приглашенного еще нет аккаунта. Токен приходит в адресе и
 * проверяется на backend до отрисовки формы — иначе человек заполнил бы пароль и
 * только потом узнал, что приглашение истекло или перевыпущено.
 *
 * Экран не входит в `AppShell`: это не раздел админки, и навигация по разделам,
 * недоступным без входа, здесь была бы обманом.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // Публичный эндпоинт: сессия для него не нужна, поэтому токен не передается.
  const preview = await apiFetch<UserInvitePreview>(`/auth/invites/${encodeURIComponent(token)}`);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
      <div className="flex w-full max-w-lg flex-col gap-6 rounded-xl bg-white p-8 shadow-sm">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">OCTAGON</h1>
          <p className="mt-1 text-sm text-slate-500">
            {preview.ok
              ? 'Задайте пароль и заполните профиль — аккаунт создастся сразу.'
              : 'Приглашение недействительно'}
          </p>
        </div>

        {preview.ok ? (
          <>
            <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Приглашение действует до {preview.data.expiresAt.slice(0, 10)}.
            </p>
            <AcceptInviteForm token={token} email={preview.data.email} role={preview.data.role} />
          </>
        ) : (
          <div className="flex flex-col gap-4">
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {describePreviewError(preview.error.code, preview.error.message)}
            </p>
            <Link href="/login" className="text-sm text-slate-600 underline hover:text-slate-900">
              Перейти ко входу
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

/**
 * Понятный текст ошибки вместо кода.
 *
 * Backend намеренно не различает неизвестный, истекший и использованный токен
 * (`INVITE_INVALID`), чтобы перебором нельзя было выяснить, какие приглашения
 * существуют. Поэтому и здесь один текст с понятным следующим шагом.
 */
function describePreviewError(code: string, message: string): string {
  switch (code) {
    case 'INVITE_INVALID':
      return 'Приглашение недействительно: возможно, его перевыпустили, срок истек или ссылка уже использована. Запросите новую у администратора клуба.';
    case 'RATE_LIMITED':
      return 'Слишком много попыток открыть приглашение. Подождите минуту и попробуйте снова.';
    case 'SERVICE_UNAVAILABLE':
      return 'Сервис недоступен. Попробуйте позже или сообщите администратору клуба.';
    default:
      return message;
  }
}
