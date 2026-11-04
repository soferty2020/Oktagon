export const ATHLETE_TABS = [
  { key: 'profile', label: 'Профиль' },
  { key: 'attestations', label: 'Аттестации' },
  { key: 'competitions', label: 'Соревнования' },
  { key: 'payments', label: 'Оплаты', requiresPermission: 'payments.view' },
  { key: 'attendance', label: 'Посещаемость' },
  { key: 'history', label: 'История' },
] as const;

export type AthleteTabKey = (typeof ATHLETE_TABS)[number]['key'];

/**
 * Вкладки карточки с учётом прав.
 *
 * «Оплаты» существуют только при `payments.view`: без права вкладка не
 * показывается, и прямой переход `?tab=payments` открывает профиль, как будто
 * вкладки нет (#UAT п.5). Логика вынесена из компонента, чтобы её можно было
 * проверить тестом без входа под другой ролью.
 */
export function visibleAthleteTabs(canViewPayments: boolean) {
  return ATHLETE_TABS.filter((tab) => !('requiresPermission' in tab) || canViewPayments);
}

export function resolveAthleteTab(
  requested: string | undefined,
  canViewPayments: boolean,
): AthleteTabKey {
  const tabs = visibleAthleteTabs(canViewPayments);
  const found = tabs.find((tab) => tab.key === requested);
  return found ? found.key : 'profile';
}
