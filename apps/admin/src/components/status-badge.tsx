/**
 * Единый бейдж статуса.
 *
 * Раньше каждый раздел выводил сырое значение из базы: на экране появлялось
 * `ACTIVE` и `PARTIALLY_PAID` вместо «Активен» и «Частично». Новости и расчётные
 * периоды имели свои бейджи, остальные — нет. Один компонент убирает и перевод,
 * и расхождение оформления.
 *
 * Неизвестное значение выводится как есть: молча подменять его на «—» значило бы
 * скрыть новый статус, который появился в API.
 */
const TONES = {
  success: 'bg-success/10 text-success',
  warning: 'bg-accent-soft text-accent',
  danger: 'bg-danger/10 text-danger',
  muted: 'bg-canvas text-muted',
} as const;

type Tone = keyof typeof TONES;

const STATUS: Record<string, { label: string; tone: Tone }> = {
  // Спортсмен, пользователь, членство
  ACTIVE: { label: 'Активен', tone: 'success' },
  FROZEN: { label: 'Заморожен', tone: 'warning' },
  ARCHIVED: { label: 'В архиве', tone: 'muted' },
  LEFT: { label: 'Выбыл', tone: 'muted' },
  INVITED: { label: 'Приглашён', tone: 'warning' },
  BLOCKED: { label: 'Заблокирован', tone: 'danger' },
  // Расчётный период
  PAID: { label: 'Оплачен', tone: 'success' },
  PARTIALLY_PAID: { label: 'Частично', tone: 'warning' },
  UNPAID: { label: 'Не оплачен', tone: 'danger' },
  // Занятие
  SCHEDULED: { label: 'Запланировано', tone: 'muted' },
  MOVED: { label: 'Перенесено', tone: 'warning' },
  CANCELLED: { label: 'Отменено', tone: 'danger' },
  COMPLETED: { label: 'Проведено', tone: 'success' },
  // Новость
  DRAFT: { label: 'Черновик', tone: 'muted' },
  PUBLISHED: { label: 'Опубликована', tone: 'success' },
  // Роли
  SUPERADMIN: { label: 'Руководитель', tone: 'success' },
  STAFF: { label: 'Сотрудник', tone: 'muted' },
  MEMBER: { label: 'Участник', tone: 'muted' },
  // Посещаемость
  PRESENT: { label: 'Был', tone: 'success' },
  ABSENT: { label: 'Не был', tone: 'danger' },
  EXCUSED: { label: 'Уважительная', tone: 'warning' },
  UNMARKED: { label: 'Не отмечено', tone: 'muted' },
};

/** Подпись статуса без оформления: для строк, где бейдж не помещается. */
export function statusLabel(value: string): string {
  return STATUS[value]?.label ?? value;
}

/** Тона для статуса: используются и вне бейджа (например, цвет строки). */
export function statusTone(value: string): Tone {
  return STATUS[value]?.tone ?? 'muted';
}

export function StatusBadge({ value, className }: { value: string; className?: string }) {
  const entry = STATUS[value];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        TONES[entry?.tone ?? 'muted']
      }${className ? ` ${className}` : ''}`}
    >
      {entry?.label ?? value}
    </span>
  );
}
