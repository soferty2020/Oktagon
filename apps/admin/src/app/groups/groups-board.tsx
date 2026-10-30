'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useActionState, useEffect, useMemo, useState } from 'react';

import { createGroupAction, type GroupFormState } from './actions';
import { fieldClass } from '@/components/ui';

interface GroupItem {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  hallId: string | null;
  hallName: string | null;
  activeMembersCount: number;
  trainers: { id: string; displayName: string }[];
  schedule: string | null;
}

interface HallItem {
  id: string;
  name: string;
  address: string | null;
}

interface Option {
  id: string;
  name: string;
}

const initialState: GroupFormState = {};

/**
 * Доска групп: фильтры, блоки залов и панель создания.
 *
 * Поиск уходит в API (`?search=`), а зал, тренер и статус фильтруют уже
 * загруженный список: эти поля есть у каждой группы, и отдельный запрос на
 * каждый селект ничего бы не добавил.
 */
export function GroupsBoard({
  groups,
  halls,
  trainers,
  canManage,
  search,
  openNew = false,
}: {
  groups: GroupItem[];
  halls: HallItem[];
  trainers: Option[];
  canManage: boolean;
  search: string;
  openNew?: boolean;
}) {
  const router = useRouter();
  const [hallId, setHallId] = useState('');
  const [trainerId, setTrainerId] = useState('');
  const [status, setStatus] = useState('');
  const [searchValue, setSearchValue] = useState(search);
  const [drawerOpen, setDrawerOpen] = useState(openNew);
  const [state, formAction, pending] = useActionState(createGroupAction, initialState);

  useEffect(() => {
    setSearchValue(search);
  }, [search]);

  // Успешное создание: закрываем панель и показываем группу в её зале.
  useEffect(() => {
    if (state.success) {
      setDrawerOpen(false);
      router.refresh();
    }
  }, [state.success, router]);

  const visible = useMemo(
    () =>
      groups.filter((group) => {
        if (hallId && group.hallId !== hallId) return false;
        if (trainerId && !group.trainers.some((trainer) => trainer.id === trainerId)) return false;
        if (status === 'active' && !group.isActive) return false;
        if (status === 'inactive' && group.isActive) return false;
        return true;
      }),
    [groups, hallId, trainerId, status],
  );

  const sections = useMemo(() => {
    const map = new Map<string, { key: string; name: string; address: string | null; groups: GroupItem[] }>();

    for (const hall of halls) {
      map.set(hall.id, { key: hall.id, name: hall.name, address: hall.address, groups: [] });
    }

    for (const group of visible) {
      const key = group.hallId ?? '__none__';
      const section = map.get(key) ?? {
        key,
        name: group.hallName ?? 'Без зала',
        address: null,
        groups: [],
      };
      section.groups.push(group);
      map.set(key, section);
    }

    // Показываем все залы, даже пустые: пустой зал — это факт, а не ошибка.
    return [...map.values()].sort((left, right) => left.name.localeCompare(right.name));
  }, [halls, visible]);

  const hasFilters = Boolean(hallId || trainerId || status || search);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const value = searchValue.trim();
    router.push(value ? `/groups?search=${encodeURIComponent(value)}` : '/groups');
  };

  const reset = () => {
    setHallId('');
    setTrainerId('');
    setStatus('');
    setSearchValue('');
    router.push('/groups');
  };

  const addressLabel = (address: string | null) => {
    const value = (address ?? '').trim();
    if (!value || /укажите адрес|не указан/i.test(value)) {
      return 'Адрес не указан';
    }
    return value;
  };

  return (
    <>
      <section className="mt-6 rounded-card border border-line bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <form className="flex min-w-[220px] flex-1 items-center gap-2" onSubmit={submitSearch}>
            <input
              className="h-10 w-full rounded-lg border border-line bg-white px-3 text-sm text-ink outline-none focus-visible:border-accent"
              onChange={(event) => setSearchValue(event.target.value)}
              placeholder="Поиск по названию группы"
              value={searchValue}
            />
          </form>

          <select
            className="h-10 min-w-[140px] rounded-lg border border-line bg-white px-2 text-sm text-ink"
            onChange={(event) => setHallId(event.target.value)}
            value={hallId}
          >
            <option value="">Все залы</option>
            {halls.map((hall) => (
              <option key={hall.id} value={hall.id}>
                {hall.name}
              </option>
            ))}
          </select>

          <select
            className="h-10 min-w-[140px] rounded-lg border border-line bg-white px-2 text-sm text-ink"
            onChange={(event) => setTrainerId(event.target.value)}
            value={trainerId}
          >
            <option value="">Все тренеры</option>
            {trainers.map((trainer) => (
              <option key={trainer.id} value={trainer.id}>
                {trainer.name}
              </option>
            ))}
          </select>

          <select
            className="h-10 min-w-[132px] rounded-lg border border-line bg-white px-2 text-sm text-ink"
            onChange={(event) => setStatus(event.target.value)}
            value={status}
          >
            <option value="">Все статусы</option>
            <option value="active">Активные</option>
            <option value="inactive">Неактивные</option>
          </select>

          {hasFilters ? (
            <button
              className="h-10 rounded-lg border border-line bg-white px-3 text-sm text-ink hover:bg-canvas"
              onClick={reset}
              type="button"
            >
              Сбросить
            </button>
          ) : null}

        </div>
      </section>

      {visible.length === 0 && hasFilters ? (
        <section className="mt-4 rounded-card border border-line bg-white px-4 py-8 text-center">
          <p className="text-sm text-ink">Групп по выбранным условиям нет</p>
          <button className="mt-2 text-sm text-accent-text underline" onClick={reset} type="button">
            сбросить фильтры
          </button>
        </section>
      ) : null}

      <div className="mt-4 flex flex-col gap-4">
        {sections.map((section) => (
          <section className="overflow-hidden rounded-card border border-line bg-white" key={section.key}>
            <header className="flex flex-wrap items-center gap-3 px-4 py-3.5">
              <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-accent-soft text-accent-text">
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
                  <path d="M4 21V7l8-4 8 4v14M9 21v-6h6v6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold text-ink">{section.name}</h2>
                <p className="text-xs text-muted">{addressLabel(section.address)}</p>
              </div>
              <span className="ml-auto rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent-text">
                {section.groups.length}{' '}
                {section.groups.length === 1 ? 'группа' : section.groups.length < 5 ? 'группы' : 'групп'}
              </span>
            </header>

            {section.groups.length === 0 ? (
              <p className="border-t border-line px-4 py-4 text-sm text-muted">
                В этом зале пока нет групп.
              </p>
            ) : (
              <>
                <table className="hidden w-full border-collapse text-left md:table">
                  <thead>
                    <tr className="border-y border-line bg-[#fbfbfc] text-xs text-muted">
                      <th className="px-4 py-2 font-medium">Название группы</th>
                      <th className="px-4 py-2 font-medium">Тренер</th>
                      <th className="px-4 py-2 font-medium">Участников</th>
                      <th className="px-4 py-2 font-medium">Расписание</th>
                      <th className="px-4 py-2 font-medium">Статус</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {section.groups.map((group) => {
                      const trainer = group.trainers[0]?.displayName ?? null;
                      return (
                        <tr className="border-b border-line last:border-0" key={group.id}>
                          <td className="px-4 py-3 text-sm font-medium text-ink">{group.name}</td>
                          <td className={`px-4 py-3 text-sm ${trainer ? 'text-ink-soft' : 'text-muted'}`}>
                            {trainer ?? 'тренер не назначен'}
                          </td>
                          <td className="px-4 py-3 text-sm text-ink-soft">{group.activeMembersCount}</td>
                          <td className={`px-4 py-3 text-xs ${group.schedule ? 'text-muted' : 'text-muted'}`}>
                            {group.schedule ?? 'не задано'}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={
                                group.isActive
                                  ? 'rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700'
                                  : 'rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-muted'
                              }
                            >
                              {group.isActive ? 'активна' : 'неактивна'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <Link
                                className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink hover:bg-canvas"
                                href={`/groups/${group.id}`}
                              >
                                Открыть
                              </Link>
                              <Link
                                aria-label="Изменить группу"
                                className="grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:bg-canvas hover:text-ink"
                                href={`/groups/${group.id}`}
                              >
                                <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}>
                                  <path d="M4 20h4l10-10-4-4L4 16v4Z" strokeLinejoin="round" />
                                  <path d="M13 5l4 4" strokeLinecap="round" />
                                </svg>
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Мобильный вид: карточки вместо таблицы, иначе действия не
                    помещаются и расписание обрезается. */}
                <div className="divide-y divide-line md:hidden">
                  {section.groups.map((group) => {
                    const trainer = group.trainers[0]?.displayName ?? null;
                    return (
                      <div className="px-4 py-3" key={group.id}>
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-sm font-medium text-ink">{group.name}</span>
                          <span className="shrink-0 text-xs text-muted">
                            {group.activeMembersCount} спортсменов
                          </span>
                        </div>
                        <div className="mt-1 flex items-baseline justify-between gap-3">
                          <span className={`text-xs ${trainer ? 'text-ink-soft' : 'text-muted'}`}>
                            {trainer ?? 'тренер не назначен'}
                          </span>
                          <span className="shrink-0 text-xs text-muted">
                            {group.schedule ?? 'расписание не задано'}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          <span
                            className={
                              group.isActive
                                ? 'rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700'
                                : 'rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-muted'
                            }
                          >
                            {group.isActive ? 'активна' : 'неактивна'}
                          </span>
                          <Link
                            className="rounded-lg border border-line px-3 py-1.5 text-xs text-ink"
                            href={`/groups/${group.id}`}
                          >
                            Открыть
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>
        ))}
      </div>

      {drawerOpen ? (
        <div className="fixed inset-0 z-40 flex justify-end">
          <button
            aria-label="Закрыть панель"
            className="absolute inset-0 bg-[#0e0e10]/32"
            onClick={() => setDrawerOpen(false)}
            type="button"
          />

          <aside className="relative flex h-full w-full max-w-[420px] flex-col bg-white shadow-2xl sm:max-w-[420px]">
            <header className="flex items-start gap-3 border-b border-line px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold text-ink">Новая группа</h2>
                <p className="mt-1 text-xs text-muted">Группа появится в блоке выбранного зала.</p>
              </div>
              <button
                aria-label="Закрыть"
                className="ml-auto grid h-8 w-8 place-items-center rounded-lg border border-line text-muted hover:bg-canvas"
                onClick={() => setDrawerOpen(false)}
                type="button"
              >
                <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
                  <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
                </svg>
              </button>
            </header>

            <form action={formAction} className="flex min-h-0 flex-1 flex-col">
              <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-4">
                <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-soft">
                  Название
                  <input className={fieldClass} name="name" placeholder="Например, Дети 6–8 лет" required />
                </label>

                <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-soft">
                  Зал
                  <select className={fieldClass} defaultValue="" name="hallId">
                    <option value="">без зала</option>
                    {halls.map((hall) => (
                      <option key={hall.id} value={hall.id}>
                        {hall.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-soft">
                  Основной тренер
                  <select className={fieldClass} defaultValue="" name="trainerId">
                    <option value="">не назначен</option>
                    {trainers.map((trainer) => (
                      <option key={trainer.id} value={trainer.id}>
                        {trainer.name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1.5 text-xs font-medium text-ink-soft">
                  Описание
                  <textarea
                    className={`${fieldClass} h-auto min-h-[84px] py-2`}
                    maxLength={200}
                    name="description"
                    placeholder="Кратко: уровень и особенности группы"
                  />
                </label>

                {state.error ? (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700" role="alert">
                    {state.error}
                  </p>
                ) : null}
              </div>

              <div className="flex gap-2 border-t border-line px-5 py-4">
                <button
                  className="h-10 flex-1 rounded-lg border border-line bg-white text-sm text-ink hover:bg-canvas"
                  onClick={() => setDrawerOpen(false)}
                  type="button"
                >
                  Отмена
                </button>
                <button
                  className="h-10 flex-[2] rounded-lg bg-accent text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-60"
                  disabled={pending}
                  type="submit"
                >
                  {pending ? 'Сохранение…' : 'Создать группу'}
                </button>
              </div>
            </form>
          </aside>
        </div>
      ) : null}
    </>
  );
}
