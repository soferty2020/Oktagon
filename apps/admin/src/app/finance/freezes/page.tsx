import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AppShell, Notice, PageHeader } from '@/components/app-shell';
import { statusLabel } from '@/components/status-badge';
import { apiFetch, describeError } from '@/lib/api/client';
import { formatCalendarDate } from '@/lib/money';
import { getCurrentUser, readTokens } from '@/lib/server/session';
import { OpenFreezeForm } from '../freeze-forms';

export const metadata = {
  title: 'Заморозки — OCTAGON',
};

interface AthleteView {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  status: string;
}

interface FreezeView {
  id: string;
  athleteId: string;
  startedOn: string;
  endedOn: string | null;
  reason: string | null;
  isOpen: boolean;
}

/**
 * Заморозки (эпик F, BR-005).
 *
 * Заморозка адресуется спортсменом: смотреть «все заморозки клуба» в MVP нечем —
 * такая выборка потребовала бы отдельного эндпоинта, которого нет в контракте.
 * Поэтому экран ведет к карточке спортсмена, где видна история и открыта форма.
 *
 * Спортсмен выбирается из списка, а не вводится идентификатором: заморозку
 * оформляет администратор, и запоминать UUID он не должен. Выбранный спортсмен
 * попадает в адрес страницы — ссылку можно передать коллеге.
 */
export default async function FreezesPage({
  searchParams,
}: {
  searchParams: Promise<{ athleteId?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    redirect('/login');
  }

  const { athleteId } = await searchParams;
  const { accessToken } = await readTokens();

  const canViewFreezes = user.permissions.includes('freezes.view');
  const canEditFreezes = user.permissions.includes('freezes.edit');
  const canViewAthletes = user.permissions.includes('athletes.view');

  const [athletes, freezes] = await Promise.all([
    canViewAthletes
      ? apiFetch<AthleteView[] | { items?: AthleteView[] }>('/athletes', { accessToken })
      : null,
    canViewFreezes && athleteId
      ? apiFetch<FreezeView[]>(`/athletes/${athleteId}/freezes`, { accessToken })
      : null,
  ]);

  const athleteList = athletes?.ok
    ? Array.isArray(athletes.data)
      ? athletes.data
      : (athletes.data.items ?? [])
    : [];
  const selected = athleteId ? athleteList.find((athlete) => athlete.id === athleteId) : undefined;
  const openFreeze = (freezes?.ok ? freezes.data : []).find((freeze) => freeze.isOpen) ?? null;

  if (!canViewFreezes) {
    return (
      <AppShell user={user}>
        <PageHeader title="Заморозки" />
        <Notice tone="error">
          Раздел доступен только с правом «freezes.view» (BR-010). Права выдаются в разделе
          «Пользователи».
        </Notice>
      </AppShell>
    );
  }

  return (
    <AppShell user={user}>
      <PageHeader
        title="Заморозки"
        description="Заморозка — открытый период приостановления: начало и завершение можно внести задним числом (BR-005)."
        actions={
          <Link href="/finance" className="text-sm text-muted hover:text-ink">
            ← Финансы
          </Link>
        }
      />

      {!canViewAthletes ? (
        <Notice tone="info">
          Чтобы выбрать спортсмена, нужен доступ к справочнику спортсменов (право «athletes.view»).
          Откройте карточку спортсмена из раздела «Спортсмены» — заморозки видны и там.
        </Notice>
      ) : (
        <form action="/finance/freezes" className="flex flex-wrap items-end gap-2">
          <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-muted">
            Спортсмен
            <select
              name="athleteId"
              required
              defaultValue={athleteId ?? ''}
              className="rounded-md border border-line px-3 py-2 text-sm outline-none focus:border-accent"
            >
              <option value="" disabled>
                выберите спортсмена
              </option>
              {athleteList.map((athlete) => (
                <option key={athlete.id} value={athlete.id}>
                  {athlete.lastName} {athlete.firstName}
                  {athlete.middleName ? ` ${athlete.middleName}` : ''}
                  {athlete.status === 'ACTIVE' ? '' : ` · ${statusLabel(athlete.status)}`}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="rounded-md border border-line bg-white px-4 py-2 text-sm text-ink hover:bg-canvas"
          >
            Показать заморозки
          </button>
        </form>
      )}

      {athletes && !athletes.ok ? (
        <div className="mt-4">
          <Notice tone="error">{describeError(athletes.error)}</Notice>
        </div>
      ) : null}

      {athleteId ? (
        <section className="mt-6 rounded-card border border-line bg-white p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">
              {selected ? `${selected.lastName} ${selected.firstName}` : 'Выбранный спортсмен'}
            </h2>
            <Link
              href={`/finance/athletes/${athleteId}`}
              className="text-xs text-muted underline hover:text-ink"
            >
              Финансы спортсмена →
            </Link>
          </div>

          {freezes && !freezes.ok ? (
            <div className="mt-3">
              <Notice tone="error">{describeError(freezes.error)}</Notice>
            </div>
          ) : (
            <>
              {canEditFreezes ? (
                openFreeze ? (
                  <div className="mt-3">
                    <Notice>
                      У спортсмена уже есть открытая заморозка с{' '}
                      {formatCalendarDate(openFreeze.startedOn)}. Вторая одновременная заморозка
                      запрещена: завершите текущую в карточке финансов.
                    </Notice>
                  </div>
                ) : (
                  <div className="mt-3">
                    <OpenFreezeForm athleteId={athleteId} />
                  </div>
                )
              ) : (
                <div className="mt-3">
                  <Notice>
                    Заморозки доступны только для просмотра: нет права «freezes.edit».
                  </Notice>
                </div>
              )}

              <table className="mt-4 w-full text-left text-sm">
                <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
                  <tr>
                    <th className="py-2">Начало</th>
                    <th className="py-2">Завершение</th>
                    <th className="py-2">Причина</th>
                    <th className="py-2">Состояние</th>
                  </tr>
                </thead>
                <tbody>
                  {(freezes?.ok ? freezes.data : []).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-4 text-sm text-muted">
                        Заморозок не было
                      </td>
                    </tr>
                  ) : (
                    (freezes?.ok ? freezes.data : []).map((freeze) => (
                      <tr key={freeze.id} className="border-b border-line last:border-0">
                        <td className="py-2 text-ink">
                          {formatCalendarDate(freeze.startedOn)}
                        </td>
                        <td className="py-2 text-muted">
                          {freeze.endedOn ? formatCalendarDate(freeze.endedOn) : 'не завершена'}
                        </td>
                        <td className="py-2 text-muted">{freeze.reason ?? '—'}</td>
                        <td className="py-2">
                          <span
                            className={
                              freeze.isOpen
                                ? 'rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700'
                                : 'rounded-full bg-canvas px-2 py-1 text-xs text-muted'
                            }
                          >
                            {freeze.isOpen ? 'открыта' : 'завершена'}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </>
          )}
        </section>
      ) : canViewAthletes ? (
        <div className="mt-6">
          <Notice>
            Выберите спортсмена, чтобы открыть или завершить заморозку. Заморозка освобождает от
            задолженности только за месяц, который она накрывает (BR-004).
          </Notice>
        </div>
      ) : null}
    </AppShell>
  );
}
