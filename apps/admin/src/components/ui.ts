/**
 * Общие классы полей и кнопок.
 *
 * До батча B каждый файл объявлял свой `inputClass` — 15 копий одной строки. Из-за
 * этого поле на «Финансах» и поле в «Настройках» могли разойтись после правки в
 * одном месте, что уже случалось: рамка появлялась там, где её не было в макете.
 *
 * Поле по макету — серая плашка без обводки, радиус 10; фокус виден кольцом
 * акцента, а не сменой цвета рамки: рамка сдвигала бы содержимое на пиксель.
 */

/** Поле ввода и выпадающий список. */
export const fieldClass =
  'w-full rounded-control bg-canvas px-3 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:ring-2 focus:ring-accent/30';

/** Компактное поле для плотных таблиц. */
export const fieldCompactClass =
  'w-full rounded-control bg-canvas px-2 py-1.5 text-xs text-ink outline-none placeholder:text-muted focus:ring-2 focus:ring-accent/30';

/** Подпись поля. */
export const labelClass = 'flex flex-col gap-1.5 text-xs font-medium text-muted';

/** Главная кнопка формы. */
export const primaryButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-control bg-accent px-4 py-2.5 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-60';

/** Второстепенная кнопка: серая плашка, как «Отмена» в макете. */
export const secondaryButtonClass =
  'inline-flex items-center justify-center gap-1.5 rounded-control bg-canvas px-4 py-2.5 text-sm font-medium text-ink transition hover:bg-line disabled:opacity-60';

/** Компактная второстепенная кнопка для строк таблиц. */
export const secondaryButtonCompactClass =
  'inline-flex items-center justify-center gap-1 rounded-control bg-canvas px-3 py-1.5 text-xs font-medium text-ink transition hover:bg-line disabled:opacity-60';
