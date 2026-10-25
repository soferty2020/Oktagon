/**
 * Генератор экрана дашборда OCTAGON для FigCraft.
 *
 * Скрипт `figcraft-cli run` — массив команд; ссылки на созданные слои идут через
 * {$step: n}. Ids назначаются по порядку (страница = 1, первый слой = 2), но
 * ссылаться на номера вручную нельзя: порядок правок меняется, а $step устойчив.
 */
import { writeFileSync } from 'node:fs';

const steps = [];
const add = (command, params) => {
  steps.push({ command, params });
  return steps.length - 1;
};
const ref = (step) => ({ $step: step });
const hex = (color) => color;

// --- палитра из токенов проекта ---
const INK = '#0E0E10';
const INK_SOFT = '#1A1A1E';
const ACCENT = '#FF6B00';
const CANVAS = '#F7F7F9';
const LINE = '#EDEDF0';
const MUTED = '#8A8A8F';
const WHITE = '#FFFFFF';
const SUCCESS = '#2E9E5B';

// --- каркас ---
const screen = add('frame.create', {
  x: 0,
  y: 0,
  width: 1440,
  height: 960,
  name: 'OCTAGON / Обзор',
  props: { fill: CANVAS },
});

const sidebar = add('node.create', {
  type: 'frame',
  parent: ref(screen),
  x: 0,
  y: 0,
  width: 248,
  height: 960,
  name: 'Sidebar',
  props: { fill: INK },
});

add('node.create', {
  type: 'text',
  parent: ref(sidebar),
  x: 24,
  y: 26,
  text: 'OCTAGON',
  name: 'Логотип',
  props: { fill: WHITE, fontSize: 18, fontStyle: 'Bold', letterSpacing: 3, fontFamily: 'Inter' },
});

// Активный пункт: плашка и оранжевая полоса слева.
const active = add('node.create', {
  type: 'rectangle',
  parent: ref(sidebar),
  x: 8,
  y: 92,
  width: 232,
  height: 40,
  name: 'Активный пункт',
  props: { fill: INK_SOFT, cornerRadius: 6 },
});

add('node.create', {
  type: 'rectangle',
  parent: ref(sidebar),
  x: 0,
  y: 92,
  width: 3,
  height: 40,
  name: 'Полоса',
  props: { fill: ACCENT },
});

const NAV = [
  'Обзор',
  'Спортсмены',
  'Группы',
  'Тренеры',
  'Филиалы и залы',
  'Расписание',
  'Посещаемость',
  'Финансы',
  'Новости',
  'Чаты',
  'Пользователи',
  'Настройки',
];

NAV.forEach((label, index) => {
  add('node.create', {
    type: 'text',
    parent: ref(sidebar),
    x: 24,
    y: 102 + index * 44,
    text: label,
    name: `Пункт: ${label}`,
    props: {
      fill: index === 0 ? WHITE : '#A0A0A8',
      fontSize: 14,
      fontFamily: 'Inter',
      fontStyle: index === 0 ? 'Medium' : 'Regular',
    },
  });
});

// --- шапка ---
const header = add('node.create', {
  type: 'frame',
  parent: ref(screen),
  x: 248,
  y: 0,
  width: 1192,
  height: 64,
  name: 'Header',
  props: { fill: WHITE },
});

add('node.create', {
  type: 'rectangle',
  parent: ref(header),
  x: 0,
  y: 63,
  width: 1192,
  height: 1,
  name: 'Разделитель',
  props: { fill: LINE },
});

add('node.create', {
  type: 'text',
  parent: ref(header),
  x: 24,
  y: 23,
  text: 'OCTAGON',
  name: 'Крошка: бренд',
  props: { fill: INK, fontSize: 14, fontStyle: 'Bold', letterSpacing: 2, fontFamily: 'Inter' },
});

add('node.create', {
  type: 'text',
  parent: ref(header),
  x: 116,
  y: 23,
  text: '/',
  name: 'Крошка: разделитель',
  props: { fill: MUTED, fontSize: 14, fontFamily: 'Inter' },
});

add('node.create', {
  type: 'text',
  parent: ref(header),
  x: 134,
  y: 23,
  text: 'Обзор',
  name: 'Крошка: раздел',
  props: { fill: MUTED, fontSize: 14, fontFamily: 'Inter' },
});

// --- заголовок страницы ---
add('node.create', {
  type: 'text',
  parent: ref(screen),
  x: 272,
  y: 92,
  text: 'Обзор клуба',
  name: 'Заголовок',
  props: { fill: INK, fontSize: 24, fontStyle: 'Bold', fontFamily: 'Inter' },
});

add('node.create', {
  type: 'text',
  parent: ref(screen),
  x: 272,
  y: 128,
  text: 'Состояние клуба: спортсмены, занятия, финансы месяца',
  name: 'Описание',
  props: { fill: MUTED, fontSize: 14, fontFamily: 'Inter' },
});

// --- KPI ---
const KPI = [
  { label: 'Спортсмены', value: '40', note: '+3 за месяц' },
  { label: 'Выручка', value: '185 000 ₽', note: 'Октябрь 2026' },
  { label: 'Задолженность', value: '15 000 ₽', note: 'Требует внимания', accent: true },
  { label: 'Посещаемость', value: '87%', note: 'Текущий месяц' },
];

KPI.forEach((item, index) => {
  const card = add('node.create', {
    type: 'frame',
    parent: ref(screen),
    x: 272 + index * 288,
    y: 176,
    width: 272,
    height: 120,
    name: `KPI: ${item.label}`,
    props: { fill: WHITE, cornerRadius: 12 },
  });

  add('node.create', {
    type: 'rectangle',
    parent: ref(card),
    x: 20,
    y: 20,
    width: 2,
    height: 16,
    name: 'Полоса',
    props: { fill: ACCENT, cornerRadius: 1 },
  });

  add('node.create', {
    type: 'text',
    parent: ref(card),
    x: 32,
    y: 19,
    text: item.label,
    name: 'Подпись',
    props: { fill: MUTED, fontSize: 12, fontFamily: 'Inter' },
  });

  add('node.create', {
    type: 'text',
    parent: ref(card),
    x: 20,
    y: 44,
    text: item.value,
    name: 'Значение',
    props: { fill: item.accent ? ACCENT : INK, fontSize: 26, fontStyle: 'Bold', fontFamily: 'Inter' },
  });

  add('node.create', {
    type: 'text',
    parent: ref(card),
    x: 20,
    y: 86,
    text: item.note,
    name: 'Примечание',
    props: { fill: MUTED, fontSize: 12, fontFamily: 'Inter' },
  });
});

// --- посещаемость по филиалам ---
const attendance = add('node.create', {
  type: 'frame',
  parent: ref(screen),
  x: 272,
  y: 320,
  width: 660,
  height: 260,
  name: 'Карточка: посещаемость',
  props: { fill: WHITE, cornerRadius: 12 },
});

add('node.create', {
  type: 'text',
  parent: ref(attendance),
  x: 20,
  y: 18,
  text: 'Посещаемость по филиалам',
  name: 'Заголовок',
  props: { fill: INK, fontSize: 15, fontStyle: 'Bold', fontFamily: 'Inter' },
});

[
  { branch: 'Филиал 1', percent: 84, width: 380 },
  { branch: 'Филиал 2', percent: 92, width: 420 },
  { branch: 'Филиал 3', percent: 76, width: 340 },
].forEach((row, index) => {
  const y = 66 + index * 56;

  add('node.create', {
    type: 'text',
    parent: ref(attendance),
    x: 20,
    y,
    text: row.branch,
    name: 'Филиал',
    props: { fill: INK, fontSize: 13, fontFamily: 'Inter' },
  });

  add('node.create', {
    type: 'rectangle',
    parent: ref(attendance),
    x: 130,
    y: y + 3,
    width: 460,
    height: 8,
    name: 'Дорожка',
    props: { fill: CANVAS, cornerRadius: 4 },
  });

  add('node.create', {
    type: 'rectangle',
    parent: ref(attendance),
    x: 130,
    y: y + 3,
    width: row.width,
    height: 8,
    name: 'Заполнение',
    props: { fill: ACCENT, cornerRadius: 4 },
  });

  add('node.create', {
    type: 'text',
    parent: ref(attendance),
    x: 600,
    y: y - 4,
    text: `${row.percent}%`,
    name: 'Процент',
    props: { fill: MUTED, fontSize: 13, fontFamily: 'Inter' },
  });
});

// --- финансовая сводка ---
const finance = add('node.create', {
  type: 'frame',
  parent: ref(screen),
  x: 952,
  y: 320,
  width: 400,
  height: 260,
  name: 'Карточка: финансы',
  props: { fill: WHITE, cornerRadius: 12 },
});

add('node.create', {
  type: 'text',
  parent: ref(finance),
  x: 20,
  y: 18,
  text: 'Финансовая сводка',
  name: 'Заголовок',
  props: { fill: INK, fontSize: 15, fontStyle: 'Bold', fontFamily: 'Inter' },
});

add('node.create', {
  type: 'text',
  parent: ref(finance),
  x: 20,
  y: 42,
  text: 'Октябрь 2026',
  name: 'Период',
  props: { fill: MUTED, fontSize: 12, fontFamily: 'Inter' },
});

add('node.create', {
  type: 'rectangle',
  parent: ref(finance),
  x: 20,
  y: 78,
  width: 360,
  height: 10,
  name: 'Дорожка',
  props: { fill: CANVAS, cornerRadius: 5 },
});

add('node.create', {
  type: 'rectangle',
  parent: ref(finance),
  x: 20,
  y: 78,
  width: 330,
  height: 10,
  name: 'Оплачено',
  props: { fill: ACCENT, cornerRadius: 5 },
});

[
  { label: 'Оплачено', value: '185 000 ₽', color: INK, y: 108 },
  { label: 'Задолженность', value: '15 000 ₽', color: ACCENT, y: 164 },
].forEach((row) => {
  add('node.create', {
    type: 'text',
    parent: ref(finance),
    x: 20,
    y: row.y,
    text: row.label,
    name: row.label,
    props: { fill: MUTED, fontSize: 13, fontFamily: 'Inter' },
  });

  add('node.create', {
    type: 'text',
    parent: ref(finance),
    x: 20,
    y: row.y + 22,
    text: row.value,
    name: `${row.label}: сумма`,
    props: { fill: row.color, fontSize: 18, fontStyle: 'Bold', fontFamily: 'Inter' },
  });
});

// --- ближайшие тренировки ---
const sessions = add('node.create', {
  type: 'frame',
  parent: ref(screen),
  x: 272,
  y: 604,
  width: 1080,
  height: 300,
  name: 'Карточка: тренировки',
  props: { fill: WHITE, cornerRadius: 12 },
});

add('node.create', {
  type: 'text',
  parent: ref(sessions),
  x: 20,
  y: 18,
  text: 'Ближайшие тренировки',
  name: 'Заголовок',
  props: { fill: INK, fontSize: 15, fontStyle: 'Bold', fontFamily: 'Inter' },
});

['Время', 'Группа', 'Филиал', 'Тренер'].forEach((label, index) => {
  add('node.create', {
    type: 'text',
    parent: ref(sessions),
    x: 20 + index * 220,
    y: 54,
    text: label,
    name: `Колонка: ${label}`,
    props: { fill: MUTED, fontSize: 12, fontFamily: 'Inter' },
  });
});

[
  { time: '18:00', group: 'Дети 7–10', branch: 'Филиал 1', trainer: 'Иванов И.И.' },
  { time: '19:30', group: 'Подростки', branch: 'Филиал 2', trainer: 'Петров А.А.' },
  { time: '20:00', group: 'Взрослые', branch: 'Филиал 3', trainer: 'Сидоров П.С.' },
].forEach((row, index) => {
  const y = 88 + index * 44;

  add('node.create', {
    type: 'rectangle',
    parent: ref(sessions),
    x: 20,
    y: y + 36,
    width: 1040,
    height: 1,
    name: 'Разделитель',
    props: { fill: LINE },
  });

  [row.time, row.group, row.branch, row.trainer].forEach((value, column) => {
    add('node.create', {
      type: 'text',
      parent: ref(sessions),
      x: 20 + column * 220,
      y,
      text: value,
      name: `Значение: ${value}`,
      props: { fill: INK, fontSize: 13, fontFamily: 'Inter' },
    });
  });
});

writeFileSync('.tools/figcraft/dashboard.json', JSON.stringify(steps, null, 2), 'utf8');
console.log(`  шагов: ${steps.length}`);
console.log(`  активный пункт: ${active}`);
