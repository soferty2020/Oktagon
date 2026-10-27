/**
 * Карточка спортсмена — уточнённый вариант A по референсу владельца.
 *
 * Что изменилось против варианта A:
 * - шапка светлая, с тёплым подтоном и мягкими кругами вместо чёрной плашки;
 * - убран прогресс «10 из 11 ступеней» — он ничего не решает в карточке;
 * - группа и зал — чипами с иконками, как на референсе;
 * - строки контактов с иконками и тонкими разделителями;
 * - действия в правой колонке — с иконками.
 *
 * Бренд не меняется: тёмный сайдбар, оранжевый #FF6B00, шрифт Inter, токены
 * клуба. Hallmark: подписи обычным регистром, без средних точек, без
 * декоративных точек статуса.
 */
import { writeScenario } from './lib.mjs';

const INK = '#0E0E10';
const INK_SOFT = '#22222A';
const ACCENT = '#FF6B00';
const ACCENT_SOFT = '#FFF0E5';
const ACCENT_WARM = '#FFE3CC';
const WARM = '#FFF8F2';
const WARM_EDGE = '#F5E6D8';
const CANVAS = '#F7F7F9';
const LINE = '#EDEDF0';
const MUTED = '#6B6B72';
const WHITE = '#FFFFFF';

const steps = [];
const ref = (step) => ({ $step: step });

function add(command, params) {
  steps.push({ command, params });
  return steps.length - 1;
}

const rect = (parent, x, y, width, height, props = {}, name) =>
  add('node.create', {
    type: 'rectangle',
    parent: ref(parent),
    x,
    y,
    width,
    height,
    name: name ?? 'Прямоугольник',
    props,
  });

const ellipse = (parent, x, y, width, height, props = {}, name) =>
  add('node.create', {
    type: 'ellipse',
    parent: ref(parent),
    x,
    y,
    width,
    height,
    name: name ?? 'Круг',
    props,
  });

const frame = (parent, x, y, width, height, props = {}, name) =>
  add('node.create', {
    type: 'frame',
    parent: parent === null ? undefined : ref(parent),
    x,
    y,
    width,
    height,
    name: name ?? 'Фрейм',
    props,
  });

const text = (parent, x, y, value, props = {}, name) => {
  const { width, ...rest } = props;

  return add('node.create', {
    type: 'text',
    parent: ref(parent),
    x,
    y,
    ...(width ? { width } : {}),
    text: value,
    name: name ?? value,
    props: { fontFamily: 'Inter', ...rest },
  });
};

const ICONS = {
  calendar: 'M3 5h18v16H3z M3 10h18 M8 3v4 M16 3v4',
  phone: 'M5 4h3l2 5-2.5 1.5a11 11 0 0 0 5 5L14 13l5 2v3a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z',
  mail: 'M3 6h18v12H3z M3 7l9 6 9-6',
  group: 'M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1 M9.5 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6 M21 19v-1a4 4 0 0 0-3-3.9 M16 4.1a4 4 0 0 1 0 7.8',
  pin: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z M12 8.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5',
  pencil: 'M4 20h4L20 8l-4-4L4 16z M14 6l4 4',
  plus: 'M12 5v14 M5 12h14',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0z M8 6H5v2a3 3 0 0 0 3 3 M16 6h3v2a3 3 0 0 1-3 3 M10 17h4v3h-4z',
  archive: 'M3 5h18v4H3z M5 9v10h14V9 M9 13h6',
  dots: 'M12 6h.01 M12 12h.01 M12 18h.01',
};

function icon(parent, x, y, size, name, color = MUTED) {
  return add('node.create', {
    type: 'vector',
    parent: ref(parent),
    x,
    y,
    width: size,
    height: size,
    path: ICONS[name],
    name: `Иконка: ${name}`,
    props: { stroke: color, strokeWeight: 1.7, fill: 'transparent' },
  });
}

const NAV = ['Обзор', 'Спортсмены', 'Заявки', 'Группы', 'Тренеры', 'Расписание', 'Посещаемость', 'Аттестации', 'Соревнования', 'Финансы', 'Отчёты', 'Настройки'];

function sidebar(root, height) {
  const bar = frame(root, 0, 0, 248, height, { fill: INK }, 'Сайдбар');

  text(bar, 24, 26, 'OCTAGON', { fill: WHITE, fontSize: 18, fontStyle: 'Bold', letterSpacing: 3 }, 'Логотип');
  text(bar, 24, 50, 'KARATE CLUB', { fill: '#5A5A64', fontSize: 8, letterSpacing: 2 }, 'Подпись логотипа');

  NAV.forEach((label, index) => {
    const top = 92 + index * 40;

    if (label === 'Спортсмены') {
      rect(bar, 8, top, 232, 36, { fill: INK_SOFT, cornerRadius: 8 }, 'Активный пункт');
      rect(bar, 0, top, 3, 36, { fill: ACCENT }, 'Полоса');
    }

    text(bar, 24, top + 9, label, {
      fill: label === 'Спортсмены' ? WHITE : '#9A9AA2',
      fontSize: 13,
      fontStyle: label === 'Спортсмены' ? 'Medium' : 'Regular',
    }, `Пункт: ${label}`);
  });
}

function topBar(root, x, width) {
  const bar = frame(root, x, 0, width, 64, { fill: WHITE }, 'Шапка');

  rect(bar, 0, 63, width, 1, { fill: LINE }, 'Разделитель шапки');

  text(bar, 24, 24, 'Спортсмены', { fill: MUTED, fontSize: 13 }, 'Крошка: раздел');
  text(bar, 116, 24, '/', { fill: '#C8C8CE', fontSize: 13 }, 'Крошка: слэш');
  text(bar, 132, 24, 'Сагабиев Дмитрий', { fill: INK, fontSize: 13, fontStyle: 'Medium' }, 'Крошка: имя');

  rect(bar, width - 200, 16, 176, 32, { fill: CANVAS, cornerRadius: 16 }, 'Профиль пользователя');
  text(bar, width - 184, 24, 'Владелец Клуба', { fill: INK, fontSize: 12, fontStyle: 'Medium' }, 'Имя пользователя');
  text(bar, width - 40, 22, '⌄', { fill: MUTED, fontSize: 12 }, 'Стрелка профиля');
}

function chip(parent, x, y, width, label, iconName) {
  const box = frame(parent, x, y, width, 32, { fill: WHITE, cornerRadius: 16, stroke: LINE, strokeWeight: 1 }, `Чип: ${label}`);

  // Зазор 14px после иконки: 16px иконка + 14 = текст на 44. Текст на 9 —
  // по центру высоты чипа (32/2 = 16, высота строки ~15).
  icon(box, 14, 8, 16, iconName, '#8A8A92');
  text(box, 44, 9, label, { fill: '#3A3A42', fontSize: 12 }, `Текст чипа: ${label}`);

  return box;
}

/** Шапка профиля: светлая, тёплая, без прогресса ступеней. */
function heroLight(parent, x, y, width) {
  const hero = frame(parent, x, y, width, 232, { fill: WARM, cornerRadius: 18, stroke: WARM_EDGE, strokeWeight: 1 }, 'Профиль');

  // Мягкие круги как в референсе: тёплые, полупрозрачные по цвету, не декор-шум.
  ellipse(hero, width - 300, -60, 260, 260, { fill: '#FFF1E4' }, 'Круг 1');
  ellipse(hero, width - 120, 96, 200, 200, { fill: '#FFEBD9' }, 'Круг 2');

  ellipse(hero, 28, 28, 76, 76, { fill: ACCENT_WARM }, 'Аватар');
  text(hero, 28, 50, 'ДС', { fill: '#B24A00', fontSize: 24, fontStyle: 'Bold', textAlign: 'center', width: 76 }, 'Инициалы');

  text(hero, 124, 26, 'Сагабиев Дмитрий Олегович', { fill: INK, fontSize: 28, fontStyle: 'Bold' }, 'ФИО');

  ellipse(hero, 124, 72, 8, 8, { fill: '#2E9E5B' }, 'Точка статуса');
  text(hero, 138, 66, 'Активен, с мая 2025', { fill: '#5A5A62', fontSize: 13 }, 'Статус');

  chip(hero, 124, 96, 168, 'Дети 10–12 лет', 'group');
  chip(hero, 302, 96, 172, 'Центральный зал', 'pin');

  // Ступень и пояс: главное число, без «из скольких».
  const statX = width - 360;

  text(hero, statX, 26, 'Ступень', { fill: '#8A7A6A', fontSize: 12 }, 'Подпись ступени');
  text(hero, statX, 44, '10', { fill: ACCENT, fontSize: 56, fontStyle: 'Bold' }, 'Ступень');
  text(hero, statX + 68, 74, 'кю', { fill: '#A08A78', fontSize: 18, fontStyle: 'Medium' }, 'Кю');

  text(hero, statX + 140, 26, 'Пояс', { fill: '#8A7A6A', fontSize: 12 }, 'Подпись пояса');
  rect(hero, statX + 140, 52, 136, 30, { fill: ACCENT_SOFT, cornerRadius: 15 }, 'Плашка пояса');
  rect(hero, statX + 140, 52, 4, 30, { fill: ACCENT, cornerRadius: 2 }, 'Полоска пояса');
  text(hero, statX + 156, 58, 'Оранжевый', { fill: '#B24A00', fontSize: 13, fontStyle: 'Medium' }, 'Пояс');

  // Действия — справа внизу, чтобы не спорить с числом.
  rect(hero, width - 372, 168, 168, 40, { fill: WHITE, cornerRadius: 10, stroke: '#E2D5C8', strokeWeight: 1 }, 'Изменить');
  text(hero, width - 372, 180, 'Изменить', { fill: INK, fontSize: 13, fontStyle: 'Medium', textAlign: 'center', width: 168 }, 'Текст изменить');

  rect(hero, width - 192, 168, 164, 40, { fill: ACCENT, cornerRadius: 10 }, 'Аттестация');
  text(hero, width - 192, 180, '+ Аттестация', { fill: WHITE, fontSize: 13, fontStyle: 'Medium', textAlign: 'center', width: 164 }, 'Текст аттестации');
}

function tabsBar(root, x, y, width, items) {
  const bar = frame(root, x, y, width, 46, { fill: '#F1EFEC', cornerRadius: 12 }, 'Вкладки');
  const itemWidth = Math.floor((width - 8) / items.length);

  items.forEach((label, index) => {
    const active = index === 0;
    if (active) {
      rect(bar, 4 + index * itemWidth, 4, itemWidth - 4, 38, { fill: WHITE, cornerRadius: 9 }, 'Активная вкладка');
    }
    text(bar, 4 + index * itemWidth, 15, label, {
      fill: active ? INK : '#6E6E78',
      fontSize: 13,
      fontStyle: active ? 'Medium' : 'Regular',
      textAlign: 'center',
      width: itemWidth - 4,
    }, `Вкладка: ${label}`);
  });
}

/** Контакты: строки с иконкой, подписью, значением и разделителем. */
function contactsCard(root, x, y, width, rows) {
  const card = frame(root, x, y, width, 268, { fill: WHITE, cornerRadius: 16, stroke: LINE, strokeWeight: 1 }, 'Контакты');

  text(card, 28, 24, 'Контакты', { fill: INK, fontSize: 17, fontStyle: 'Bold' }, 'Заголовок контактов');
  text(card, 28, 50, 'Как связаться с родителем', { fill: MUTED, fontSize: 12 }, 'Подпись контактов');

  rows.forEach(([iconName, label, value], index) => {
    const top = 92 + index * 60;

    // Иконка 18px: текст начинается через 18px зазора (28 + 18 + 18 = 64).
    icon(card, 28, top + 6, 18, iconName, '#8A8A92');
    text(card, 64, top, label, { fill: MUTED, fontSize: 12 }, `Подпись: ${label}`);
    text(card, 64, top + 19, value, { fill: INK, fontSize: 15, fontStyle: 'Medium' }, `Значение: ${label}`);

    if (index < rows.length - 1) {
      rect(card, 28, top + 48, width - 56, 1, { fill: LINE }, 'Разделитель строки');
    }
  });

  return card;
}

function historyCard(root, x, y, width, height) {
  const card = frame(root, x, y, width, height, { fill: WHITE, cornerRadius: 16, stroke: LINE, strokeWeight: 1 }, 'История ступеней');

  text(card, 28, 24, 'История ступеней', { fill: INK, fontSize: 17, fontStyle: 'Bold' }, 'Заголовок истории');
  text(card, 28, 50, 'От белого пояса до текущей ступени', { fill: MUTED, fontSize: 12 }, 'Подпись истории');

  const events = [
    ['10 кю', 'оранжевый пояс', '16.12.2025', true],
    ['0 кю', 'белый пояс', '25.05.2025', false],
  ];

  events.forEach(([rank, belt, date, current], index) => {
    const top = 96 + index * 66;

    if (index < events.length - 1) {
      rect(card, 33, top + 14, 1, 50, { fill: LINE }, 'Линия таймлайна');
    }

    ellipse(card, 28, top, 11, 11, { fill: current ? ACCENT : LINE }, 'Точка');
    text(card, 56, top - 4, rank, { fill: INK, fontSize: 15, fontStyle: 'Bold' }, 'Ступень');
    text(card, 128, top - 2, belt, { fill: MUTED, fontSize: 13 }, 'Пояс');
    text(card, 330, top - 2, date, { fill: MUTED, fontSize: 13 }, 'Дата');

    if (current) {
      rect(card, 420, top - 5, 60, 20, { fill: ACCENT_SOFT, cornerRadius: 10 }, 'Метка текущей');
      text(card, 428, top - 1, 'сейчас', { fill: '#B24A00', fontSize: 11, fontStyle: 'Medium' }, 'Текст метки');
    }
  });

  return card;
}

function accountsCard(root, x, y, width) {
  const card = frame(root, x, y, width, 148, { fill: WHITE, cornerRadius: 16, stroke: LINE, strokeWeight: 1 }, 'Связанные аккаунты');

  text(card, 24, 20, 'Связанные аккаунты', { fill: INK, fontSize: 15, fontStyle: 'Bold' }, 'Заголовок аккаунтов');

  rect(card, 20, 56, width - 40, 64, { fill: '#FAFAFB', cornerRadius: 10 }, 'Аккаунт');
  rect(card, 20, 56, 3, 64, { fill: ACCENT, cornerRadius: 2 }, 'Полоска аккаунта');
  text(card, 38, 66, 'o.sagabiev@gmail.com', { fill: INK, fontSize: 13, fontStyle: 'Medium' }, 'Почта аккаунта');
  text(card, 38, 88, 'родитель, основной', { fill: MUTED, fontSize: 12 }, 'Роль аккаунта');
  icon(card, width - 44, 78, 16, 'dots', '#8A8A92');

  return card;
}

function actionsCard(root, x, y, width) {
  const card = frame(root, x, y, width, 170, { fill: WHITE, cornerRadius: 16, stroke: LINE, strokeWeight: 1 }, 'Действия');

  text(card, 24, 20, 'Действия', { fill: INK, fontSize: 15, fontStyle: 'Bold' }, 'Заголовок действий');

  const items = [
    ['pencil', 'Изменить профиль'],
    ['plus', 'Добавить аттестацию'],
    ['trophy', 'Назначить на соревнование'],
  ];

  items.forEach(([iconName, label], index) => {
    // Шаг 36 вместо 34 — строкам тесно; зазор после иконки 19px (24 + 17 + 19 = 60),
    // текст на +1 от верха иконки, чтобы центры совпали.
    const top = 60 + index * 36;
    icon(card, 24, top, 17, iconName, '#6B6B72');
    text(card, 60, top + 1, label, { fill: '#2A2A32', fontSize: 13 }, `Действие: ${label}`);
  });

  return card;
}

function archiveCard(root, x, y, width) {
  const card = frame(root, x, y, width, 116, { fill: '#FDF3F3', cornerRadius: 16, stroke: '#F6DADA', strokeWeight: 1 }, 'Архивирование');

  icon(card, 22, 18, 17, 'archive', '#8A2B2B');
  text(card, 48, 17, 'Архивирование', { fill: '#8A2B2B', fontSize: 14, fontStyle: 'Bold' }, 'Заголовок архива');
  text(card, 22, 46, 'Карточка уйдёт из справочников, история сохранится.', { fill: '#A05A5A', fontSize: 11, width: width - 44 }, 'Текст архива');
  rect(card, 22, 74, 120, 26, { fill: WHITE, cornerRadius: 8, stroke: '#E3B4B4', strokeWeight: 1 }, 'Кнопка архива');
  text(card, 22, 80, 'В архив', { fill: '#8A2B2B', fontSize: 11, textAlign: 'center', width: 120 }, 'Текст кнопки архива');

  return card;
}

// --- Desktop 1440 --------------------------------------------------------
{
  const root = frame(null, 0, 0, 1440, 940, { fill: CANVAS }, 'Карточка: светлая шапка (1440)');

  sidebar(root, 940);
  topBar(root, 248, 1192);

  heroLight(root, 280, 92, 1128);
  tabsBar(root, 280, 348, 620, ['Профиль', 'Аттестации', 'Оплаты', 'История']);

  contactsCard(root, 280, 416, 772, [
    ['calendar', 'Дата рождения', '24.08.2020'],
    ['phone', 'Телефон', '+7 967 213-16-16'],
    ['mail', 'Почта', 'parent@example.com'],
  ]);

  historyCard(root, 280, 708, 772, 216);

  accountsCard(root, 1076, 416, 332);
  actionsCard(root, 1076, 588, 332);
  archiveCard(root, 1076, 782, 332);
}

// --- Mobile 390 ----------------------------------------------------------
{
  const root = frame(null, 0, 0, 390, 940, { fill: CANVAS }, 'Карточка: светлая шапка (390)');

  const hero = frame(root, 0, 0, 390, 262, { fill: WARM }, 'Профиль');

  text(hero, 20, 18, '← Спортсмены', { fill: '#7A6A5C', fontSize: 12 }, 'Назад');
  text(hero, 356, 16, '⋯', { fill: '#7A6A5C', fontSize: 16 }, 'Меню');

  ellipse(hero, 20, 48, 60, 60, { fill: ACCENT_WARM }, 'Аватар');
  text(hero, 20, 66, 'ДС', { fill: '#B24A00', fontSize: 19, fontStyle: 'Bold', textAlign: 'center', width: 60 }, 'Инициалы');

  text(hero, 92, 50, 'Сагабиев', { fill: INK, fontSize: 20, fontStyle: 'Bold' }, 'Фамилия');
  text(hero, 92, 74, 'Дмитрий Олегович', { fill: '#4A4A52', fontSize: 13 }, 'Имя');

  ellipse(hero, 92, 100, 7, 7, { fill: '#2E9E5B' }, 'Точка статуса');
  text(hero, 105, 95, 'Активен, с мая 2025', { fill: '#5A5A62', fontSize: 11 }, 'Статус');

  // Ступень и пояс — без прогресса.
  text(hero, 20, 126, '10', { fill: ACCENT, fontSize: 40, fontStyle: 'Bold' }, 'Ступень');
  text(hero, 68, 144, 'кю', { fill: '#A08A78', fontSize: 14 }, 'Кю');

  rect(hero, 100, 134, 112, 26, { fill: ACCENT_SOFT, cornerRadius: 13 }, 'Пояс');
  text(hero, 114, 140, 'Оранжевый', { fill: '#B24A00', fontSize: 12, fontStyle: 'Medium' }, 'Текст пояса');

  text(hero, 20, 182, 'Группа «Дети 10–12 лет», Центральный зал', { fill: '#5A5A62', fontSize: 12 }, 'Группа и зал');

  rect(hero, 20, 208, (390 - 52) / 2, 40, { fill: WHITE, cornerRadius: 10, stroke: '#E2D5C8', strokeWeight: 1 }, 'Изменить');
  text(hero, 20, 220, 'Изменить', { fill: INK, fontSize: 13, fontStyle: 'Medium', textAlign: 'center', width: (390 - 52) / 2 }, 'Текст изменить');

  rect(hero, 20 + (390 - 52) / 2 + 12, 208, (390 - 52) / 2, 40, { fill: ACCENT, cornerRadius: 10 }, 'Аттестация');
  text(hero, 20 + (390 - 52) / 2 + 12, 220, '+ Аттестация', { fill: WHITE, fontSize: 13, fontStyle: 'Medium', textAlign: 'center', width: (390 - 52) / 2 }, 'Текст аттестации');

  // Вкладки — вне шапки, на светлом фоне.
  const tabs = frame(root, 16, 278, 358, 42, { fill: '#F1EFEC', cornerRadius: 11 }, 'Вкладки');
  ['Профиль', 'Аттестации', 'История'].forEach((label, index) => {
    const w = Math.floor((358 - 8) / 3);
    if (index === 0) {
      rect(tabs, 4, 4, w - 4, 34, { fill: WHITE, cornerRadius: 8 }, 'Активная');
    }
    text(tabs, 4 + index * w, 14, label, {
      fill: index === 0 ? INK : '#6E6E78',
      fontSize: 12,
      textAlign: 'center',
      width: w - 4,
    }, `Вкладка: ${label}`);
  });

  const contacts = frame(root, 16, 340, 358, 240, { fill: WHITE, cornerRadius: 16, stroke: LINE, strokeWeight: 1 }, 'Контакты');
  text(contacts, 20, 18, 'Контакты', { fill: INK, fontSize: 15, fontStyle: 'Bold' }, 'Заголовок контактов');

  [['calendar', 'Дата рождения', '24.08.2020'], ['phone', 'Телефон', '+7 967 213-16-16'], ['mail', 'Почта', 'parent@example.com']].forEach(([iconName, label, value], index) => {
    const top = 54 + index * 58;
    // Те же 16px зазора после иконки, что на десктопе.
    icon(contacts, 20, top + 4, 16, iconName, '#8A8A92');
    text(contacts, 52, top, label, { fill: MUTED, fontSize: 11 }, `Подпись: ${label}`);
    text(contacts, 52, top + 17, value, { fill: INK, fontSize: 14, fontStyle: 'Medium' }, `Значение: ${label}`);
    if (index < 2) {
      rect(contacts, 20, top + 44, 318, 1, { fill: LINE }, 'Разделитель');
    }
  });

  const history = frame(root, 16, 600, 358, 196, { fill: WHITE, cornerRadius: 16, stroke: LINE, strokeWeight: 1 }, 'История');
  text(history, 20, 18, 'История ступеней', { fill: INK, fontSize: 15, fontStyle: 'Bold' }, 'Заголовок истории');

  [['10 кю', 'оранжевый', '16.12.2025', true], ['0 кю', 'белый', '25.05.2025', false]].forEach(([rank, belt, date, current], index) => {
    const top = 62 + index * 58;
    if (index === 0) {
      rect(history, 25, top + 13, 1, 42, { fill: LINE }, 'Линия');
    }
    ellipse(history, 20, top, 10, 10, { fill: current ? ACCENT : LINE }, 'Точка');
    text(history, 44, top - 3, rank, { fill: INK, fontSize: 14, fontStyle: 'Bold' }, 'Ступень');
    text(history, 44, top + 15, `${belt} пояс, ${date}`, { fill: MUTED, fontSize: 12 }, 'Пояс и дата');
    if (current) {
      rect(history, 250, top - 4, 58, 20, { fill: ACCENT_SOFT, cornerRadius: 10 }, 'Метка');
      text(history, 258, top, 'сейчас', { fill: '#B24A00', fontSize: 11, fontStyle: 'Medium' }, 'Текст метки');
    }
  });
}

const count = writeScenario('docs/design/figcraft/athlete-refined.json', steps);
console.log(`  шагов: ${count}`);
