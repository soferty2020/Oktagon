import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { CreatePanel } from '@/components/ui/create-panel';
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
        actions={
          canManage ? (
            <CreatePanel
              title="Новый зал"
              description="Адрес — главное: по нему родители понимают, куда ехать."
              buttonLabel="Новый зал"
            >
              <CreateHallForm inPanel />
            </CreatePanel>
          ) : null
        }
      />

      <div className="flex flex-col gap-4">
        {!result.ok ? <Notice tone="error">{describeError(result.error)}</Notice> : null}

        {result.ok && details.length === 0 ? (
          <Notice>Залов пока нет: создайте первый кнопкой «Новый зал».</Notice>
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
    </AppShell>
  );
}
