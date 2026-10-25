import Link from 'next/link';

import { Icon, type IconName } from '@/components/icons';

/**
 * Пустое состояние списка: круг с иконкой, заголовок, пояснение и действие.
 *
 * Раньше пустые списки выглядели по-разному: где-то строка серого текста, а
 * где-то ничего — таблица просто оставалась пустой, и было непонятно, это «нет
 * данных», «нет прав» или «ещё не загрузилось». Макет задает одну форму, и она
 * отвечает на этот вопрос: что произошло и что сделать дальше.
 *
 * Действие необязательно: если пользователь не может ничего создать, кнопка
 * только обещает то, чего нет.
 */
export function EmptyState({
  icon = 'athletes',
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description: string;
  action?: { href: string; label: string };
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-accent-soft text-accent">
        <Icon name={icon} size={24} />
      </span>
      <p className="mt-5 text-base font-semibold text-ink">{title}</p>
      <p className="mt-2 max-w-sm text-sm text-muted">{description}</p>
      {action ? (
        <Link
          href={action.href}
          className="mt-6 inline-flex items-center gap-1.5 rounded-control bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
