/**
 * Формы и состояния: создание спортсмена, добавление в группу, успех
 * сохранения, подтверждение отмены.
 *
 * Отдельный генератор: это диалоги и карточки состояний, а не страницы с
 * сайдбаром.
 */
import { createBuilder, writeScenario, TOKENS } from './lib.mjs';

const b = createBuilder();
const GAP = 900;

/** Заголовок диалога с подписью и разделителем. */
function dialog(title, subtitle, width, height, x, name) {
  const frame = b.frame(null, x, 0, width, height, { fill: TOKENS.white, cornerRadius: 24 }, name);

  b.text(frame, 32, 32, title, { fill: TOKENS.ink, fontSize: 22, fontStyle: 'Bold' }, 'Заголовок диалога');
  b.text(frame, 32, 66, subtitle, { fill: TOKENS.muted, fontSize: 13 }, 'Подпись диалога');
  b.rect(frame, 0, 104, width, 1, { fill: TOKENS.line }, 'Разделитель');

  return frame;
}

/** Поле формы: подпись и серая плашка. */
function field(parent, x, y, width, label, value) {
  b.text(parent, x, y, label, { fill: TOKENS.muted, fontSize: 12 }, `Поле: ${label}`);

  const box = b.frame(parent, x, y + 22, width, 44, { fill: TOKENS.canvas, cornerRadius: 10 }, 'Поле ввода');
  b.text(box, 14, value ? 12 : 13, value || '—', { fill: value ? TOKENS.ink : TOKENS.muted, fontSize: 14 }, 'Значение');

  return box;
}

/** Кнопки внизу диалога. */
function footer(parent, width, y, primary, secondary = 'Отмена') {
  b.rect(parent, 0, y, width, 1, { fill: TOKENS.line }, 'Разделитель');

  const cancelWidth = 132;
  const primaryWidth = 160;
  const primaryX = width - 32 - primaryWidth;
  const cancelX = primaryX - 16 - cancelWidth;

  const cancel = b.frame(parent, cancelX, y + 24, cancelWidth, 44, { fill: TOKENS.canvas, cornerRadius: 10 }, `Кнопка: ${secondary}`);
  b.text(cancel, 0, 13, secondary, { fill: TOKENS.ink, fontSize: 14, textAlign: 'center', width: cancelWidth }, 'Текст');

  const action = b.frame(parent, primaryX, y + 24, primaryWidth, 44, { fill: TOKENS.accent, cornerRadius: 10 }, `Кнопка: ${primary}`);
  b.text(action, 0, 13, primary, { fill: TOKENS.white, fontSize: 14, textAlign: 'center', width: primaryWidth }, 'Текст');
}

// ---------------------------------------------------------------------------
// 1. Новый спортсмен
// ---------------------------------------------------------------------------
let frame = dialog('Новый спортсмен', 'Карточка спортсмена · обязательные поля', 760, 780, 0, 'Диалог: новый спортсмен');

field(frame, 32, 136, 696, 'Фамилия', '');
field(frame, 32, 216, 696, 'Имя', '');
field(frame, 32, 296, 696, 'Дата рождения', '');
field(frame, 32, 376, 696, 'Группа', 'не выбрана');
field(frame, 32, 456, 696, 'Телефон родителя', '');
field(frame, 32, 536, 696, 'Электронная почта', '');

footer(frame, 760, 620, 'Создать карточку');

// ---------------------------------------------------------------------------
// 2. Добавить в группу
// ---------------------------------------------------------------------------
frame = dialog('Добавить в группу', 'Иванов Максим · 7 лет', 760, 560, GAP, 'Диалог: добавить в группу');

field(frame, 32, 136, 696, 'Группа', 'Дети 7–10, новички');
field(frame, 32, 216, 696, 'Дата зачисления', '01.11.2026');
field(frame, 32, 296, 696, 'Комментарий', '');

footer(frame, 760, 400, 'Зачислить');

// ---------------------------------------------------------------------------
// 3. Успех сохранения
// ---------------------------------------------------------------------------
frame = b.frame(null, GAP * 2, 0, 560, 400, { fill: TOKENS.white, cornerRadius: 16 }, 'Состояние: сохранено');

const successIcon = b.frame(frame, 232, 48, 96, 96, { fill: '#E8F5EE', cornerRadius: 48 }, 'Иконка успеха');
b.text(successIcon, 0, 26, '✓', { fill: TOKENS.success, fontSize: 44, textAlign: 'center', width: 96 }, 'Галочка');

b.text(frame, 0, 176, 'Изменения сохранены', {
  fill: TOKENS.ink,
  fontSize: 20,
  fontStyle: 'Bold',
  textAlign: 'center',
  width: 560,
}, 'Заголовок');

b.text(frame, 0, 210, 'Карточка спортсмена обновлена', {
  fill: TOKENS.muted,
  fontSize: 14,
  textAlign: 'center',
  width: 560,
}, 'Подпись');

const successButton = b.frame(frame, 180, 264, 200, 44, { fill: TOKENS.accent, cornerRadius: 10 }, 'Кнопка: Готово');
b.text(successButton, 0, 13, 'Готово', { fill: TOKENS.white, fontSize: 14, textAlign: 'center', width: 200 }, 'Текст');

// ---------------------------------------------------------------------------
// 4. Подтверждение отмены
// ---------------------------------------------------------------------------
frame = b.frame(null, GAP * 3, 0, 560, 320, { fill: TOKENS.white, cornerRadius: 16 }, 'Состояние: подтверждение');

b.text(frame, 32, 36, 'Отменить оплату?', { fill: TOKENS.ink, fontSize: 20, fontStyle: 'Bold' }, 'Заголовок');
b.text(frame, 32, 74, 'Оплата 5 000 ₽ от 14.10.2026 будет отменена. Действие попадёт в журнал.',
  { fill: TOKENS.muted, fontSize: 13 }, 'Пояснение');

const keep = b.frame(frame, 248, 216, 132, 44, { fill: TOKENS.canvas, cornerRadius: 10 }, 'Кнопка: Оставить');
b.text(keep, 0, 13, 'Оставить', { fill: TOKENS.ink, fontSize: 14, textAlign: 'center', width: 132 }, 'Текст');

const confirm = b.frame(frame, 396, 216, 132, 44, { fill: TOKENS.danger, cornerRadius: 10 }, 'Кнопка: Отменить');
b.text(confirm, 0, 13, 'Отменить', { fill: TOKENS.white, fontSize: 14, textAlign: 'center', width: 132 }, 'Текст');

const count = writeScenario(new URL('./forms.json', import.meta.url), b.steps);
console.log(`  экранов: 4, шагов: ${count}`);
