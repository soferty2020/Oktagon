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

// ---------------------------------------------------------------------------
// 4. Карточка спортсмена
// ---------------------------------------------------------------------------
const profile = b.frame(null, GAP * 3, 0, 1440, 960, { fill: TOKENS.canvas }, 'Карточка спортсмена');
b.sidebar(profile, 'Спортсмены');
b.header(profile, 'Спортсмены');

b.text(profile, 272, 92, 'Иванов Максим', { fill: TOKENS.ink, fontSize: 24, fontStyle: 'Bold' }, 'Имя');
b.text(profile, 272, 128, '7 лет · Дети 7–10 · Филиал 1', { fill: TOKENS.muted, fontSize: 14 }, 'Подпись');
b.badge(profile, 272, 158, 'Активен', 'success');

b.primaryButton(profile, 1000, 88, 200, 'Редактировать');

const info = b.card(profile, 272, 200, 560, 420, 'Информация');
[
  { label: 'Группа', value: 'Дети 7–10, новички' },
  { label: 'Тренер', value: 'Иванов И.И.' },
  { label: 'Зал', value: 'Зал 1' },
  { label: 'Пояс', value: 'Оранжевый' },
  { label: 'Дата аттестации', value: '10.02.2024' },
  { label: 'Абонемент', value: 'Бессрочный, 1 месяц' },
  { label: 'Телефон родителя', value: '+7 (913) 123-45-67' },
  { label: 'Мед. ограничения', value: 'Нет' },
].forEach((row, index) => {
  const y = 64 + index * 44;
  b.text(info, 20, y, row.label, { fill: TOKENS.muted, fontSize: 13 }, row.label);
  b.text(info, 220, y, row.value, { fill: TOKENS.ink, fontSize: 13, fontStyle: 'Medium' }, `${row.label}: значение`);
});

const certs = b.card(profile, 856, 200, 496, 260, 'Аттестации');
[
  { date: '10.02.2024', stage: '8 кю', belt: 'Оранжевый' },
  { date: '12.06.2023', stage: '9 кю', belt: 'Жёлтый' },
].forEach((row, index) => {
  const y = 64 + index * 44;
  b.rect(certs, 20, y + 30, 456, 1, { fill: TOKENS.line }, 'Разделитель');
  b.text(certs, 20, y, row.date, { fill: TOKENS.muted, fontSize: 13 }, 'Дата');
  b.text(certs, 160, y, row.stage, { fill: TOKENS.ink, fontSize: 13 }, 'Ступень');
  b.text(certs, 280, y, row.belt, { fill: TOKENS.ink, fontSize: 13 }, 'Пояс');
});

const freezes = b.card(profile, 856, 484, 496, 136, 'Заморозки');
b.text(freezes, 20, 64, 'Активных заморозок нет', { fill: TOKENS.muted, fontSize: 13 }, 'Пусто');

const payments = b.card(profile, 272, 640, 1080, 260, 'Расчётные периоды');
[
  { month: 'Октябрь 2026', paid: '5 000 ₽', status: 'Оплачен', tone: 'success' },
  { month: 'Сентябрь 2026', paid: '5 000 ₽', status: 'Оплачен', tone: 'success' },
  { month: 'Август 2026', paid: '2 500 ₽', status: 'Частично', tone: 'warning' },
].forEach((row, index) => {
  const y = 64 + index * 48;
  b.rect(payments, 20, y + 34, 1040, 1, { fill: TOKENS.line }, 'Разделитель');
  b.text(payments, 20, y, row.month, { fill: TOKENS.ink, fontSize: 13 }, 'Месяц');
  b.text(payments, 360, y, row.paid, { fill: TOKENS.ink, fontSize: 13 }, 'Оплачено');
  b.badge(payments, 760, y - 4, row.status, row.tone);
});

// ---------------------------------------------------------------------------
// 5. Диалоги
// ---------------------------------------------------------------------------
const dialogFrame = (x, name, width, height) =>
  b.frame(null, x, 1100, width, height, { fill: TOKENS.white, cornerRadius: 24 }, name);

const dialogHeader = (dialog, title, subtitle) => {
  b.text(dialog, 32, 32, title, { fill: TOKENS.ink, fontSize: 22, fontStyle: 'Bold' }, 'Заголовок диалога');
  b.text(dialog, 32, 66, subtitle, { fill: TOKENS.muted, fontSize: 13 }, 'Подпись диалога');
  b.rect(dialog, 0, 104, 760, 1, { fill: TOKENS.line }, 'Разделитель');
};

const field = (dialog, x, y, label, value) => {
  b.text(dialog, x, y, label, { fill: TOKENS.muted, fontSize: 12 }, `Поле: ${label}`);
  const box = b.frame(dialog, x, y + 22, 696, 44, { fill: TOKENS.canvas, cornerRadius: 10 }, 'Поле ввода');
  b.text(box, 14, 12, value, { fill: TOKENS.ink, fontSize: 14 }, 'Значение');
  return box;
};

const dialogFooter = (dialog, y) => {
  b.rect(dialog, 0, y, 760, 1, { fill: TOKENS.line }, 'Разделитель');
  const cancel = b.frame(dialog, 440, y + 24, 132, 44, { fill: TOKENS.canvas, cornerRadius: 10 }, 'Кнопка: Отмена');
  b.text(cancel, 34, 13, 'Отмена', { fill: TOKENS.ink, fontSize: 14 }, 'Текст');
  b.primaryButton(dialog, 588, y + 24, 140, 'Сохранить');
};

const editDialog = dialogFrame(GAP * 4, 'Диалог: спортсмен', 760, 700);
dialogHeader(editDialog, 'Редактирование спортсмена', 'Карточка спортсмена · обязательные поля');
field(editDialog, 32, 136, 'Фамилия', 'Иванов');
field(editDialog, 32, 216, 'Имя', 'Максим');
field(editDialog, 32, 296, 'Дата рождения', '14.05.2018');
field(editDialog, 32, 376, 'Группа', 'Дети 7–10 лет');
field(editDialog, 32, 456, 'Связанный аккаунт', 'anna@example.com');
dialogFooter(editDialog, 540);

const payDialog = dialogFrame(GAP * 4 + 800, 'Диалог: оплата', 760, 560);
dialogHeader(payDialog, 'Оплата', 'Расчётный период · Октябрь 2026');
field(payDialog, 32, 136, 'Сумма', '5 000 ₽');
field(payDialog, 32, 216, 'Способ', 'Перевод');
field(payDialog, 32, 296, 'Комментарий', 'Оплата за октябрь');
dialogFooter(payDialog, 400);

const freezeDialog = dialogFrame(GAP * 4 + 1600, 'Диалог: заморозка', 760, 560);
dialogHeader(freezeDialog, 'Заморозка', 'Приостановка начислений');
field(freezeDialog, 32, 136, 'Начало', '01.11.2026');
field(freezeDialog, 32, 216, 'Окончание', '30.11.2026');
field(freezeDialog, 32, 296, 'Причина', 'Поездка');
dialogFooter(freezeDialog, 400);

const moveDialog = dialogFrame(GAP * 4 + 2400, 'Диалог: перенос', 760, 620);
dialogHeader(moveDialog, 'Перенос тренировки', 'Дети 7–10 · 18:00–19:30');
field(moveDialog, 32, 136, 'Новая дата', '28.10.2026');
field(moveDialog, 32, 216, 'Новое время', '19:00');
field(moveDialog, 32, 296, 'Зал', 'Зал 2');
field(moveDialog, 32, 376, 'Тренер', 'Петров А.А.');
dialogFooter(moveDialog, 460);

// ---------------------------------------------------------------------------
// 6. Состояния
// ---------------------------------------------------------------------------
const stateCard = (x, name) =>
  b.frame(null, x, 2000, 750, 580, { fill: TOKENS.canvas, cornerRadius: 16 }, name);

const empty = stateCard(GAP * 4, 'Состояние: пусто');
const emptyBox = b.frame(empty, 24, 88, 702, 460, { fill: TOKENS.white, cornerRadius: 12 }, 'Пустое состояние');
b.text(empty, 24, 24, 'Пустой список', { fill: TOKENS.ink, fontSize: 18, fontStyle: 'Bold' }, 'Заголовок');
b.text(empty, 24, 52, 'Состояние интерфейса · спецификация', { fill: TOKENS.muted, fontSize: 13 }, 'Подпись');

const round = b.frame(emptyBox, 301, 88, 100, 100, { fill: TOKENS.accentSoft, cornerRadius: 50 }, 'Иконка');
b.rect(round, 34, 44, 32, 4, { fill: TOKENS.accent, cornerRadius: 2 }, 'Полоса иконки');

b.text(emptyBox, 151, 220, 'Пока нет спортсменов', { fill: TOKENS.ink, fontSize: 20, fontStyle: 'Bold' }, 'Заголовок пустого');
b.text(emptyBox, 96, 258, 'Добавьте первую карточку, чтобы начать учёт', { fill: TOKENS.muted, fontSize: 14 }, 'Подпись пустого');
b.primaryButton(emptyBox, 245, 320, 212, '+ Добавить спортсмена');

const loading = stateCard(GAP * 4 + 800, 'Состояние: загрузка');
const loadBox = b.frame(loading, 24, 88, 702, 460, { fill: TOKENS.white, cornerRadius: 12 }, 'Скелетон');
b.text(loading, 24, 24, 'Загрузка', { fill: TOKENS.ink, fontSize: 18, fontStyle: 'Bold' }, 'Заголовок');
b.text(loading, 24, 52, 'Состояние интерфейса · спецификация', { fill: TOKENS.muted, fontSize: 13 }, 'Подпись');

Array.from({ length: 5 }).forEach((_, index) => {
  const y = 40 + index * 72;
  b.rect(loadBox, 24, y, 240, 14, { fill: TOKENS.canvas, cornerRadius: 7 }, 'Скелетон: имя');
  b.rect(loadBox, 24, y + 24, 160, 10, { fill: TOKENS.canvas, cornerRadius: 5 }, 'Скелетон: группа');
  b.rect(loadBox, 600, y, 60, 24, { fill: TOKENS.canvas, cornerRadius: 12 }, 'Скелетон: статус');
});

const errorState = stateCard(GAP * 4 + 1600, 'Состояние: ошибка');
const errorBox = b.frame(errorState, 24, 88, 702, 460, { fill: TOKENS.white, cornerRadius: 12 }, 'Форма с ошибкой');
b.text(errorState, 24, 24, 'Ошибка формы', { fill: TOKENS.ink, fontSize: 18, fontStyle: 'Bold' }, 'Заголовок');
b.text(errorState, 24, 52, 'Состояние интерфейса · спецификация', { fill: TOKENS.muted, fontSize: 13 }, 'Подпись');

b.text(errorBox, 24, 40, 'Фамилия', { fill: TOKENS.muted, fontSize: 12 }, 'Поле: фамилия');
const badField = b.frame(errorBox, 24, 62, 654, 44, { fill: TOKENS.white, cornerRadius: 10, stroke: TOKENS.danger, strokeWeight: 1 }, 'Поле с ошибкой');
b.text(badField, 14, 12, '', { fill: TOKENS.ink, fontSize: 14 }, 'Значение');
b.text(errorBox, 24, 114, 'Укажите фамилию', { fill: TOKENS.danger, fontSize: 12 }, 'Текст ошибки');

b.text(errorBox, 24, 152, 'Имя', { fill: TOKENS.muted, fontSize: 12 }, 'Поле: имя');
const goodField = b.frame(errorBox, 24, 174, 654, 44, { fill: TOKENS.canvas, cornerRadius: 10 }, 'Поле');
b.text(goodField, 14, 12, 'Максим', { fill: TOKENS.ink, fontSize: 14 }, 'Значение');

const count = writeScenario(new URL('./screens.json', import.meta.url), b.steps);
console.log(`  экранов: 11, шагов: ${count}`);
