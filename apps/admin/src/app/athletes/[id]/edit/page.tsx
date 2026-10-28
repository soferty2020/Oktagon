import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { apiFetch, describeError } from '@/lib/api/client';
import { describePermission } from '@/lib/permissions';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { EditAthleteForm } from '../../athlete-forms';

export const metadata = {
  title: 'Редактирование спортсмена — OCTAGON',
};

interface AthleteDetails {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  birthDate: string | null;
  gender: string;
  status: string;
  rank: string | null;
  rankLabel: string | null;
  beltGrade: string;
  beltAwardedAt: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
  hallId: string | null;
  group: { id: string; name: string } | null;
}

interface HallView {
  id: string;
  name: string;
}

interface GroupView {
  id: string;
  name: string;
  hallId: string | null;
}

/**
 * Редактирование карточки отдельным экраном (#60).
 *
 * Раньше форма была встроена в карточку и открыта всегда: просмотр и правка
 * смешивались, а «Сохранить» висело под длинным списком полей. Теперь карточка
 * показывает данные, а правка — здесь, с явными «Сохранить» и «Отмена».
 */
export default async function EditAthletePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  if (!user.permissions.includes('athletes.edit')) {
    return (
      <AppShell user={user}>
        <PageHeader title="Редактирование спортсмена" />
        <Notice tone="info">{describePermission('athletes.edit')}</Notice>
      </AppShell>
    );
  }

  const { id } = await params;
  const { accessToken } = await readTokens();
  const [athlete, halls, groups] = await Promise.all([
    apiFetch<AthleteDetails>(`/athletes/${id}`, { accessToken }),
    apiFetch<HallView[]>('/halls', { accessToken }),
    apiFetch<GroupView[]>('/groups', { accessToken }),
  ]);

  if (!athlete.ok) {
    if (athlete.error.status === 404) {
      notFound();
    }

    return (
      <AppShell user={user}>
        <PageHeader title="Редактирование спортсмена" />
        <Notice tone="error">{describeError(athlete.error)}</Notice>
      </AppShell>
    );
  }

  return (
    <AppShell user={user}>
      <div className="mb-4">
        <Link
          className="text-sm text-muted hover:text-ink"
          href={`/athletes/${athlete.data.id}`}
        >
          ← К карточке спортсмена
        </Link>
      </div>

      <PageHeader
        title="Редактирование"
        description={`${athlete.data.lastName} ${athlete.data.firstName}${
          athlete.data.middleName ? ` ${athlete.data.middleName}` : ''
        }`}
      />

      <EditAthleteForm
        athlete={{
          ...athlete.data,
          groupId: athlete.data.group?.id ?? null,
        }}
        groups={groups.ok ? groups.data.map(({ id, name, hallId }) => ({ id, name, hallId })) : []}
        halls={halls.ok ? halls.data.map(({ id, name }) => ({ id, name })) : []}
      />
    </AppShell>
  );
}
