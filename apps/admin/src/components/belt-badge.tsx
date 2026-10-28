import { findBeltGrade } from '@octagon/contracts';

/**
 * Пояс спортсмена: цвет полоски — цвет пояса (#73).
 *
 * Раньше бейдж всегда рисовался акцентным цветом темы: написано «Зелёный», а
 * полоска оранжевая. Для поясов это не мелочь — цвет и есть пояс.
 *
 * Для белого пояса добавляется рамка: белая полоска на светлом фоне исчезает.
 */
export function BeltBadge({
  code,
  className = '',
}: {
  code: string | null | undefined;
  className?: string;
}) {
  const belt = findBeltGrade(code);

  if (!belt) {
    return (
      <span className={`inline-flex items-center gap-2 text-[13px] text-muted ${className}`}>
        не указан
      </span>
    );
  }

  const isLight = belt.code === 'WHITE' || belt.code === 'YELLOW' || belt.code === 'YELLOW_GREEN_STRIPE';

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full py-1.5 pl-2 pr-4 text-[13px] font-medium ${className}`}
      style={{
        // Фон — очень светлый оттенок пояса: читается, но не спорит с текстом.
        backgroundColor: `${belt.color}14`,
        color: isLight ? '#2B2118' : belt.color,
      }}
    >
      <span
        className="h-5 w-1 rounded-full"
        style={{
          backgroundColor: belt.color,
          // Белый пояс на светлом фоне исчезает: нужна тонкая рамка.
          boxShadow: belt.code === 'WHITE' ? 'inset 0 0 0 1px #D9CBBE' : undefined,
        }}
      />
      {belt.label}
      {belt.stripeColor ? (
        <span
          aria-hidden
          className="h-5 w-1 rounded-full"
          style={{ backgroundColor: belt.stripeColor }}
        />
      ) : null}
    </span>
  );
}
