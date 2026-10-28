import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';

export const metadata = {
  title: 'Тренер — OCTAGON',
};

interface TrainerView {
  id: string;
  userId: string | null;
  displayName: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  bio: string | null;
  isActive: boolean;
}

/**
 * Карточка тренера (#71).
 *
 * Нужна как цель перехода из группы: раньше из «Тренер: Иванов» нельзя было
 * попасть в профиль, только в общий список.
 */
export default async function TrainerPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { id } = await params;
  const { accessToken } = await readTokens();
  const trainer = await apiFetch<TrainerView>(`/trainers/${id}`, { accessToken });

  if (!trainer.ok) {
    if (trainer.error.status === 404) {
      notFound();
    }

    return (
      <AppShell user={user}>
        <PageHeader title="Тренер" />
        <Notice tone="error">{describeError(trainer.error)}</Notice>
      </AppShell>
    );
  }

  const data = trainer.data;

  return (
    <AppShell user={user}>
      <div className="mb-4">
        <Link className="text-sm text-muted hover:text-ink" href="/trainers">
          ← Все тренеры
        </Link>
      </div>

      <PageHeader title={data.displayName} description="Профиль тренера" />

      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <section className="rounded-card border border-line bg-white p-6">
          <h2 className="text-sm font-semibold text-ink">Контакты</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-muted">Фамилия</dt>
              <dd className="mt-1 text-sm text-ink">{data.lastName}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Имя</dt>
              <dd className="mt-1 text-sm text-ink">{data.firstName}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Телефон</dt>
              <dd className="mt-1 text-sm text-ink">{data.phone ?? 'Не указан'}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Статус</dt>
              <dd className="mt-1 text-sm text-ink">
                {data.isActive ? 'активен' : 'неактивен'}
              </dd>
            </div>
          </dl>

          <div className="mt-6 border-t border-line pt-4">
            <h2 className="text-sm font-semibold text-ink">О тренере</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-ink">
              {data.bio ?? 'Биография не заполнена'}
            </p>
          </div>
        </section>

        <aside className="rounded-card border border-line bg-white p-6">
          <h2 className="text-sm font-semibold text-ink">Учётная запись</h2>
          {data.userId ? (
            <p className="mt-2 text-sm text-ink">
              Привязана. Зайти в профиль пользователя можно из раздела «Пользователи».
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted">
              Не привязана: тренер не может войти в приложение. Привязка — в разделе
              «Тренеры».
            </p>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
