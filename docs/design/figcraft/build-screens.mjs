/**
 * Три экрана админки OCTAGON для FigCraft: дашборд, спортсмены, финансы.
 *
 * Один генератор на все: общие части (сайдбар, шапка, карточки) берутся из
 * lib.mjs, поэтому экраны не разъезжаются по отступам.
 */
import { createBuilder, writeScenario, TOKENS } from './lib.mjs';

const b = createBuilder();
const GAP = 1600; // расстояние между экранами на холсте

// ---------------------------------------------------------------------------
// 1. Дашборд
// ---------------------------------------------------------------------------
const dash = b.frame(null, 0, 0, 1440, 960, { fill: TOKENS.canvas }, 'Дашборд');
b.sidebar(dash, 'Обзор');
b.header(dash, 'Обзор');
b.pageTitle(dash, 'Обзор клуба', 'Состояние клуба: спортсмены, занятия, финансы месяца');

const KPI = [
  { label: 'Спортсмены', value: '40', note: '+3 за месяц' },
  { label: 'Выручка', value: '185 000 ₽', note: 'Октябрь 2026' },
  { label: 'Задолженность', value: '15 000 ₽', note: 'Требует внимания', accent: true },
  { label: 'Посещаемость', value: '87%', note: 'Текущий месяц' },
];

KPI.forEach((item, index) => {
  const card = b.frame(dash, 272 + index * 288, 176, 272, 120, { fill: TOKENS.white, cornerRadius: 12 }, `KPI: ${item.label}`);

  b.rect(card, 20, 20, 2, 16, { fill: TOKENS.accent }, 'Полоса');
  b.text(card, 32, 19, item.label, { fill: TOKENS.muted, fontSize: 12 }, 'Подпись');
  b.text(card, 20, 44, item.value, {
    fill: item.accent ? TOKENS.accent : TOKENS.ink,
    fontSize: 26,
    fontStyle: 'Bold',
  }, 'Значение');
  b.text(card, 20, 86, item.note, { fill: TOKENS.muted, fontSize: 12 }, 'Примечание');
});

const attendance = b.card(dash, 272, 320, 660, 260, 'Посещаемость по филиалам');

[
  { branch: 'Филиал 1', percent: 84, width: 380 },
  { branch: 'Филиал 2', percent: 92, width: 420 },
  { branch: 'Филиал 3', percent: 76, width: 340 },
].forEach((row, index) => {
  const y = 66 + index * 56;
  b.text(attendance, 20, y, row.branch, { fill: TOKENS.ink, fontSize: 13 }, 'Филиал');
  b.rect(attendance, 130, y + 3, 460, 8, { fill: TOKENS.canvas, cornerRadius: 4 }, 'Дорожка');
  b.rect(attendance, 130, y + 3, row.width, 8, { fill: TOKENS.accent, cornerRadius: 4 }, 'Заполнение');
  b.text(attendance, 600, y - 4, `${row.percent}%`, { fill: TOKENS.muted, fontSize: 13 }, 'Процент');
});

const finance = b.card(dash, 952, 320, 400, 260, 'Финансовая сводка', 'Октябрь 2026');
b.rect(finance, 20, 78, 360, 10, { fill: TOKENS.canvas, cornerRadius: 5 }, 'Дорожка');
b.rect(finance, 20, 78, 330, 10, { fill: TOKENS.accent, cornerRadius: 5 }, 'Оплачено');

[
  { label: 'Оплачено', value: '185 000 ₽', color: TOKENS.ink, y: 108 },
  { label: 'Задолженность', value: '15 000 ₽', color: TOKENS.accent, y: 164 },
].forEach((row) => {
  b.text(finance, 20, row.y, row.label, { fill: TOKENS.muted, fontSize: 13 }, row.label);
  b.text(finance, 20, row.y + 22, row.value, {
    fill: row.color,
    fontSize: 18,
    fontStyle: 'Bold',
  }, `${row.label}: сумма`);
});

const sessions = b.card(dash, 272, 604, 1080, 300, 'Ближайшие тренировки');

['Время', 'Группа', 'Филиал', 'Тренер'].forEach((label, index) => {
  b.text(sessions, 20 + index * 220, 54, label, { fill: TOKENS.muted, fontSize: 12 }, `Колонка: ${label}`);
});

[
  { time: '18:00', group: 'Дети 7–10', branch: 'Филиал 1', trainer: 'Иванов И.И.' },
  { time: '19:30', group: 'Подростки', branch: 'Филиал 2', trainer: 'Петров А.А.' },
  { time: '20:00', group: 'Взрослые', branch: 'Филиал 3', trainer: 'Сидоров П.С.' },
].forEach((row, index) => {
  const y = 88 + index * 44;
  b.rect(sessions, 20, y + 36, 1040, 1, { fill: TOKENS.line }, 'Разделитель');

  [row.time, row.group, row.branch, row.trainer].forEach((value, column) => {
    b.text(sessions, 20 + column * 220, y, value, { fill: TOKENS.ink, fontSize: 13 }, `Значение: ${value}`);
  });
});

// ---------------------------------------------------------------------------
// 2. Спортсмены
// ---------------------------------------------------------------------------
const athletes = b.frame(null, GAP, 0, 1440, 960, { fill: TOKENS.canvas }, 'Спортсмены');
b.sidebar(athletes, 'Спортсмены');
b.header(athletes, 'Спортсмены');
b.pageTitle(athletes, 'Спортсмены', 'Управление карточками и группами');
b.primaryButton(athletes, 1160, 88, 248, '+ Добавить спортсмена');

const list = b.card(athletes, 272, 176, 1136, 720, 'Список спортсменов');
b.searchField(list, 20, 56, 520, 'Поиск по имени или группе');
b.filterChip(list, 556, 56, 180, 'Все филиалы');

const COLUMNS = [
  { label: 'ФИО', x: 20 },
  { label: 'Группа', x: 340 },
  { label: 'Филиал', x: 560 },
  { label: 'Пояс', x: 760 },
  { label: 'Статус', x: 980 },
];

COLUMNS.forEach((column) => {
  b.text(list, column.x, 120, column.label, { fill: TOKENS.muted, fontSize: 12 }, `Колонка: ${column.label}`);
});

const ATHLETES = [
  { name: 'Иванов Максим', group: 'Дети 7–10', branch: 'Филиал 1', belt: 'Оранжевый', status: 'Активен', tone: 'success' },
  { name: 'Петров Алексей', group: 'Подростки', branch: 'Филиал 2', belt: 'Синий', status: 'Активен', tone: 'success' },
  { name: 'Сидорова Анна', group: 'Дети 5–7', branch: 'Филиал 3', belt: 'Белый', status: 'Активен', tone: 'success' },
  { name: 'Кузнецов Иван', group: 'Дети 7–10', branch: 'Филиал 1', belt: 'Жёлтый', status: 'Заморожен', tone: 'warning' },
  { name: 'Смирнова Мария', group: 'Дети 5–7', branch: 'Филиал 2', belt: 'Белый', status: 'Активен', tone: 'success' },
];

ATHLETES.forEach((row, index) => {
  const y = 160 + index * 56;
  b.rect(list, 20, y + 40, 1096, 1, { fill: TOKENS.line }, 'Разделитель');

  b.text(list, COLUMNS[0].x, y, row.name, { fill: TOKENS.ink, fontSize: 13, fontStyle: 'Medium' }, 'ФИО');
  b.text(list, COLUMNS[1].x, y, row.group, { fill: TOKENS.muted, fontSize: 13 }, 'Группа');
  b.text(list, COLUMNS[2].x, y, row.branch, { fill: TOKENS.muted, fontSize: 13 }, 'Филиал');
  b.text(list, COLUMNS[3].x, y, row.belt, { fill: TOKENS.muted, fontSize: 13 }, 'Пояс');
  b.badge(list, COLUMNS[4].x, y - 4, row.status, row.tone);
});

// ---------------------------------------------------------------------------
// 3. Финансы
// ---------------------------------------------------------------------------
const money = b.frame(null, GAP * 2, 0, 1440, 960, { fill: TOKENS.canvas }, 'Финансы');
b.sidebar(money, 'Финансы');
b.header(money, 'Финансы');
b.pageTitle(money, 'Финансы клуба', 'Помесячные оплаты и задолженности');
b.primaryButton(money, 1160, 88, 248, '+ Зафиксировать оплату');

const MONEY_KPI = [
  { label: 'Поступления', value: '185 000 ₽' },
  { label: 'Задолженность', value: '15 000 ₽', accent: true },
  { label: 'Оплачено периодов', value: '34' },
  { label: 'Не оплачено', value: '6' },
];

MONEY_KPI.forEach((item, index) => {
  const card = b.frame(money, 272 + index * 288, 176, 272, 120, { fill: TOKENS.white, cornerRadius: 12 }, `KPI: ${item.label}`);

  b.text(card, 20, 20, item.label, { fill: TOKENS.muted, fontSize: 12 }, 'Подпись');
  b.text(card, 20, 48, item.value, {
    fill: item.accent ? TOKENS.accent : TOKENS.ink,
    fontSize: 26,
    fontStyle: 'Bold',
  }, 'Значение');
});

const periods = b.card(money, 272, 320, 1136, 600, 'Расчётные периоды · Октябрь 2026');

const PERIOD_COLUMNS = [
  { label: 'Спортсмен', x: 20 },
  { label: 'Филиал', x: 400 },
  { label: 'Оплачено', x: 640 },
  { label: 'Статус', x: 860 },
];

PERIOD_COLUMNS.forEach((column) => {
  b.text(periods, column.x, 64, column.label, { fill: TOKENS.muted, fontSize: 12 }, `Колонка: ${column.label}`);
});

const PERIODS = [
  { name: 'Иванов Максим', branch: 'Филиал 1', paid: '5 000 ₽', status: 'Оплачен', tone: 'success' },
  { name: 'Петров Алексей', branch: 'Филиал 2', paid: '5 000 ₽', status: 'Оплачен', tone: 'success' },
  { name: 'Сидорова Анна', branch: 'Филиал 3', paid: '2 500 ₽', status: 'Частично', tone: 'warning' },
  { name: 'Кузнецов Иван', branch: 'Филиал 1', paid: '0 ₽', status: 'Не требуется', tone: 'success' },
  { name: 'Смирнова Мария', branch: 'Филиал 2', paid: '0 ₽', status: 'Задолженность', tone: 'danger' },
];

PERIODS.forEach((row, index) => {
  const y = 104 + index * 52;
  b.rect(periods, 20, y + 38, 1096, 1, { fill: TOKENS.line }, 'Разделитель');

  b.text(periods, PERIOD_COLUMNS[0].x, y, row.name, {
    fill: TOKENS.ink,
    fontSize: 13,
    fontStyle: 'Medium',
  }, 'Спортсмен');
  b.text(periods, PERIOD_COLUMNS[1].x, y, row.branch, { fill: TOKENS.muted, fontSize: 13 }, 'Филиал');
  b.text(periods, PERIOD_COLUMNS[2].x, y, row.paid, { fill: TOKENS.ink, fontSize: 13 }, 'Оплачено');
  b.badge(periods, PERIOD_COLUMNS[3].x, y - 4, row.status, row.tone);
});

const count = writeScenario(new URL('./screens.json', import.meta.url), b.steps);
console.log(`  экранов: 3, шагов: ${count}`);
