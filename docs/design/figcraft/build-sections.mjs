/**
 * Макеты разделов, которых не было: группы, тренеры, филиалы, расписание,
 * посещаемость.
 *
 * Отдельный генератор, а не продолжение build-screens: тот файл уже собирает
 * одиннадцать экранов, и добавлять туда ещё пять значило бы держать в одном
 * месте две разные порции работы. Общие части — из lib.mjs.
 */
import { createBuilder, writeScenario, TOKENS } from './lib.mjs';

const b = createBuilder();
const GAP = 1600;

/** Экран с сайдбаром, шапкой и заголовком: у пяти разделов рамка одна. */
function screen(name, activeLabel, title, subtitle, actions, offsetX) {
  const frame = b.frame(null, offsetX, 0, 1440, 960, { fill: TOKENS.canvas }, name);
  b.sidebar(frame, activeLabel);
  b.header(frame, activeLabel);
  b.pageTitle(frame, title, subtitle);

  if (actions) {
    b.primaryButton(frame, 1160, 88, 248, actions);
  }

  return frame;
}


// ---------------------------------------------------------------------------
// 1. Группы
// ---------------------------------------------------------------------------
let frame = screen('Группы', 'Группы', 'Группы', 'Список ограничен зоной доступа', '+ Создать группу', 0);
let list = b.card(frame, 272, 176, 1136, 560, 'Список групп');

['Название', 'Основной филиал', 'Участников', 'Статус'].forEach((label, index) => {
  b.text(list, 20 + index * 280, 64, label, { fill: TOKENS.muted, fontSize: 12 }, `Колонка: ${label}`);
});

[
  { name: 'Младшая', branch: 'Главный филиал', count: '14', status: 'Активна', tone: 'success' },
  { name: 'Средняя', branch: 'Главный филиал', count: '11', status: 'Активна', tone: 'success' },
  { name: 'Старшая', branch: 'Северный филиал', count: '8', status: 'Активна', tone: 'success' },
  { name: 'Взрослые, начинающие', branch: 'Главный филиал', count: '6', status: 'Активна', tone: 'success' },
].forEach((row, index) => {
  const y = 104 + index * 56;
  b.rect(list, 20, y + 40, 1096, 1, { fill: TOKENS.line }, 'Разделитель');
  b.text(list, 20, y, row.name, { fill: TOKENS.ink, fontSize: 13, fontStyle: 'Medium' }, 'Название');
  b.text(list, 300, y, row.branch, { fill: TOKENS.muted, fontSize: 13 }, 'Филиал');
  b.text(list, 580, y, row.count, { fill: TOKENS.muted, fontSize: 13 }, 'Участников');
  b.badge(list, 860, y - 4, row.status, row.tone);
});


// ---------------------------------------------------------------------------
// 2. Тренеры
// ---------------------------------------------------------------------------
frame = screen('Тренеры', 'Тренеры', 'Тренеры', 'Профили тренеров и их доступ в систему', '+ Добавить тренера', GAP);

[
  { name: 'Иванов Иван Иванович', groups: '2 группы', phone: '+7 (913) 111-22-33', active: true },
  { name: 'Петров Алексей Алексеевич', groups: '1 группа', phone: '+7 (913) 222-33-44', active: true },
  { name: 'Сидоров Пётр Сергеевич', groups: '1 группа', phone: '+7 (913) 333-44-55', active: false },
].forEach((trainer, index) => {
  const card = b.frame(frame, 272, 176 + index * 120, 1136, 104, { fill: TOKENS.white, cornerRadius: 12 }, `Тренер: ${trainer.name}`);

  b.text(card, 20, 18, trainer.name, { fill: TOKENS.ink, fontSize: 15, fontStyle: 'Bold' }, 'Имя');
  b.text(card, 20, 44, trainer.phone, { fill: TOKENS.muted, fontSize: 13 }, 'Телефон');
  b.text(card, 20, 66, trainer.groups, { fill: TOKENS.muted, fontSize: 13 }, 'Группы');

  b.badge(card, 960, 18, trainer.active ? 'Активен' : 'Неактивен', trainer.active ? 'success' : 'muted');

  const edit = b.frame(card, 960, 54, 156, 34, { fill: TOKENS.accentSoft, cornerRadius: 10 }, 'Кнопка: Редактировать');
  b.text(edit, 0, 9, 'Редактировать', {
    fill: TOKENS.accent,
    fontSize: 12,
    fontStyle: 'Medium',
    textAlign: 'center',
  }, 'Текст кнопки');
});


// ---------------------------------------------------------------------------
// 3. Филиалы и залы
// ---------------------------------------------------------------------------
frame = screen('Филиалы', 'Филиалы и залы', 'Филиалы и залы', 'Адреса и залы для расписания', '+ Добавить филиал', GAP * 2);

[
  { name: 'Главный филиал', address: 'ул. Ленина, 10', halls: ['Зал 1', 'Зал 2'] },
  { name: 'Северный филиал', address: 'ул. Северная, 25', halls: ['Зал 1'] },
].forEach((branch, index) => {
  const card = b.card(frame, 272, 176 + index * 220, 1136, 196, branch.name, branch.address);

  branch.halls.forEach((hall, hallIndex) => {
    const row = b.frame(card, 20, 84 + hallIndex * 52, 1096, 44, { fill: TOKENS.canvas, cornerRadius: 10 }, `Зал: ${hall}`);

    b.text(row, 16, 13, hall, { fill: TOKENS.ink, fontSize: 13, fontStyle: 'Medium' }, 'Название зала');
    b.text(row, 300, 13, 'Вместимость: 20', { fill: TOKENS.muted, fontSize: 12 }, 'Вместимость');
  });
});


// ---------------------------------------------------------------------------
// 4. Расписание
// ---------------------------------------------------------------------------
frame = screen('Расписание', 'Расписание', 'Расписание', 'Шаблоны и занятия на неделю', '+ Новый шаблон', GAP * 3);

const days = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const grid = b.card(frame, 272, 176, 1136, 600, 'Неделя 21–27 октября 2026');

days.forEach((day, index) => {
  const active = index === 4;
  const cell = b.frame(grid, 20 + index * 156, 64, 144, 36, {
    fill: active ? TOKENS.accent : TOKENS.canvas,
    cornerRadius: 10,
  }, `День: ${day}`);

  b.text(cell, 0, 9, day, {
    fill: active ? TOKENS.white : TOKENS.muted,
    fontSize: 12,
    fontStyle: active ? 'Medium' : 'Regular',
    textAlign: 'center',
    width: 144,
  }, 'Подпись дня');
});

[
  { day: 0, slot: '18:00', group: 'Дети 7–10', hall: 'Зал 1', trainer: 'Иванов И.И.' },
  { day: 0, slot: '19:30', group: 'Подростки', hall: 'Зал 2', trainer: 'Петров А.А.' },
  { day: 2, slot: '18:00', group: 'Дети 7–10', hall: 'Зал 1', trainer: 'Иванов И.И.' },
  { day: 4, slot: '18:00', group: 'Дети 7–10', hall: 'Зал 1', trainer: 'Иванов И.И.' },
  { day: 4, slot: '19:30', group: 'Взрослые', hall: 'Зал 2', trainer: 'Сидоров П.С.' },
].forEach((lesson, index) => {
  const y = 120 + index * 88;
  const x = 20 + lesson.day * 156;

  const cell = b.frame(grid, x, y, 144, 76, {
    fill: TOKENS.accentSoft,
    cornerRadius: 10,
  }, `Занятие: ${lesson.group}`);

  b.text(cell, 10, 10, lesson.slot, { fill: TOKENS.accent, fontSize: 12, fontStyle: 'Bold' }, 'Время');
  b.text(cell, 10, 30, lesson.group, { fill: TOKENS.ink, fontSize: 11, fontStyle: 'Medium' }, 'Группа');
  b.text(cell, 10, 48, lesson.hall, { fill: TOKENS.muted, fontSize: 10 }, 'Зал');
});


// ---------------------------------------------------------------------------
// 5. Посещаемость
// ---------------------------------------------------------------------------
frame = screen('Посещаемость', 'Посещаемость', 'Посещаемость', 'Сводка по группам за период', undefined, GAP * 4);

const summary = b.card(frame, 272, 176, 1136, 200, 'Сводка за 30 дней');
[
  { label: 'Посещено', value: '87%', note: 'от отмеченных занятий' },
  { label: 'Пропущено', value: '9%', note: 'без уважительной причины' },
  { label: 'Уважительные', value: '4%', note: 'болезнь, поездка' },
  { label: 'Не отмечено', value: '12', note: 'занятий без журнала' },
].forEach((item, index) => {
  const x = 20 + index * 280;
  b.text(summary, x, 40, item.label, { fill: TOKENS.muted, fontSize: 12 }, 'Подпись');
  b.text(summary, x, 62, item.value, { fill: TOKENS.ink, fontSize: 24, fontStyle: 'Bold' }, 'Значение');
  b.text(summary, x, 98, item.note, { fill: TOKENS.muted, fontSize: 11 }, 'Примечание');
});

const byGroup = b.card(frame, 272, 400, 1136, 420, 'По группам');
['Группа', 'Посещено', 'Пропущено', 'Доля'].forEach((label, index) => {
  b.text(byGroup, 20 + index * 280, 64, label, { fill: TOKENS.muted, fontSize: 12 }, `Колонка: ${label}`);
});

[
  { group: 'Младшая', present: '124', absent: '12', rate: '91%' },
  { group: 'Средняя', present: '98', absent: '18', rate: '84%' },
  { group: 'Старшая', present: '76', absent: '20', rate: '79%' },
  { group: 'Взрослые', present: '54', absent: '6', rate: '90%' },
].forEach((row, index) => {
  const y = 104 + index * 52;
  b.rect(byGroup, 20, y + 38, 1096, 1, { fill: TOKENS.line }, 'Разделитель');
  b.text(byGroup, 20, y, row.group, { fill: TOKENS.ink, fontSize: 13, fontStyle: 'Medium' }, 'Группа');
  b.text(byGroup, 300, y, row.present, { fill: TOKENS.ink, fontSize: 13 }, 'Посещено');
  b.text(byGroup, 580, y, row.absent, { fill: TOKENS.muted, fontSize: 13 }, 'Пропущено');
  b.text(byGroup, 860, y, row.rate, { fill: TOKENS.accent, fontSize: 13, fontStyle: 'Medium' }, 'Доля');
});


const count = writeScenario(new URL('./sections.json', import.meta.url), b.steps);
console.log(`  экранов: 5, шагов: ${count}`);
