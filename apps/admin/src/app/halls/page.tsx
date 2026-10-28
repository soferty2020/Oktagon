import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { apiFetch, describeError } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { CreateHallForm, HallCard } from './hall-forms';

export const metadata = {
  title: 'Залы — OCTAGON',
};

interface HallView {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  capacity: number | null;
  isActive: boolean;
}

interface HallDetails extends HallView {
  groups: { id: string; name: string }[];
}

/**
 * Залы клуба (#64).
 *
 * Филиалов больше нет: клуб делится по адресам, где проходят тренировки. Зал —
 * точка входа в свои группы: в каждом зале несколько групп (по возрасту, по
 * опыту), и создаются они здесь.
 */
export default async function HallsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { accessToken } = await readTokens();
  const canManage = user.permissions.includes('branches.manage');
  const result = await apiFetch<HallView[]>('/halls', { accessToken });

  // Группы запрашиваются по залу: отдельного «списка групп по залам» нет, а
  // залов в клубе немного.
  const details: HallDetails[] = [];
  if (result.ok) {
    const loaded = await Promise.all(
      result.data.map(async (hall) => {
        const full = await apiFetch<HallDetails>(`/halls/${hall.id}`, { accessToken });
        return full.ok ? full.data : { ...hall, groups: [] };
      }),
    );
    details.push(...loaded);
  }

  return (
    <AppShell user={user}>
      <PageHeader
        title="Залы"
        description="Площадки клуба: адрес, телефон и группы каждого зала"
      />

      <div className="grid items-start gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="flex flex-col gap-4">
          {!result.ok ? <Notice tone="error">{describeError(result.error)}</Notice> : null}

          {result.ok && details.length === 0 ? (
            <Notice>Залов пока нет: создайте первый в форме справа.</Notice>
          ) : null}

          {details.map((hall) => (
            <HallCard
              canManage={canManage}
              groups={hall.groups}
              hall={hall}
              key={hall.id}
            />
          ))}
        </div>

        <aside className="rounded-card border border-line bg-white p-6">
          <h2 className="text-base font-semibold text-ink">Новый зал</h2>
          <p className="mt-1 text-xs text-muted">
            Адрес — главное: по нему родители понимают, куда ехать.
          </p>
          {canManage ? (
            <div className="mt-4">
              <CreateHallForm />
            </div>
          ) : (
            <p className="mt-4 text-xs text-muted">
              Создавать залы может администратор с правом управления структурой клуба.
            </p>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
