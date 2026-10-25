/**
 * Мобильные экраны админки 390×844: обзор, расписание, журнал посещаемости.
 *
 * Отдельный генератор, потому что здесь другая сетка: нет сайдбара, шапка тёмная,
 * внизу таб-бар. Общие токены берутся из lib.mjs, чтобы цвета не расходились с
 * десктопными экранами.
 */
import { createBuilder, writeScenario, TOKENS } from './lib.mjs';

const b = createBuilder();
const GAP = 500;
const W = 390;
const H = 844;

/** Тёмная шапка приложения. */
const appBar = (parent, title) => {
  const bar = b.frame(parent, 0, 0, W, 80, { fill: TOKENS.ink }, 'Шапка');

  b.text(bar, 20, 24, 'OCTAGON', { fill: TOKENS.white, fontSize: 17, fontStyle: 'Bold', letterSpacing: 2 }, 'Логотип');
  b.text(bar, 20, 48, 'ADMIN', { fill: TOKENS.accent, fontSize: 10, fontStyle: 'Bold', letterSpacing: 2 }, 'Подпись');

  // Гамбургер: три полосы.
  [0, 1, 2].forEach((index) => {
    b.rect(bar, 344, 32 + index * 6, 22, 2, { fill: TOKENS.white, cornerRadius: 1 }, 'Полоса меню');
  });

  if (title) {
    b.text(parent, 20, 104, title, { fill: TOKENS.ink, fontSize: 22, fontStyle: 'Bold' }, 'Заголовок');
  }

  return bar;
};

const tabBar = (parent) => {
  const bar = b.frame(parent, 0, H - 64, W, 64, { fill: TOKENS.white }, 'Таб-бар');
  b.rect(bar, 0, 0, W, 1, { fill: TOKENS.line }, 'Разделитель');

  ['Обзор', 'Группы', 'Журнал', 'Ещё'].forEach((label, index) => {
    const x = 20 + index * 92;
    b.text(bar, x, 26, label, {
      fill: index === 0 ? TOKENS.accent : TOKENS.muted,
      fontSize: 12,
      fontStyle: index === 0 ? 'Medium' : 'Regular',
    }, `Вкладка: ${label}`);
  });

  return bar;
};

const kpiCard = (parent, x, y, label, value, accent) => {
  const card = b.frame(parent, x, y, 175, 90, { fill: TOKENS.white, cornerRadius: 12 }, `KPI: ${label}`);
  b.text(card, 14, 14, label, { fill: TOKENS.muted, fontSize: 12 }, 'Подпись');
  b.text(card, 14, 42, value, {
    fill: accent ? TOKENS.accent : TOKENS.ink,
    fontSize: 22,
    fontStyle: 'Bold',
  }, 'Значение');
  return card;
};

// ---------------------------------------------------------------------------
// 1. Обзор
// ---------------------------------------------------------------------------
const overview = b.frame(null, 0, 0, W, H, { fill: TOKENS.canvas }, 'Mobile: Обзор');
appBar(overview);

kpiCard(overview, 16, 144, 'Спортсмены', '40', false);
kpiCard(overview, 199, 144, 'Выручка', '185 000 ₽', false);
kpiCard(overview, 16, 246, 'Долги', '15 000 ₽', true);
kpiCard(overview, 199, 246, 'Посещаемость', '87%', false);

const today = b.card(overview, 16, 360, 358, 300, 'Сегодня');
[
  { time: '18:00', group: 'Дети 7–10', branch: 'Филиал 1' },
  { time: '19:30', group: 'Подростки', branch: 'Филиал 2' },
  { time: '20:00', group: 'Взрослые', branch: 'Филиал 3' },
].forEach((row, index) => {
  const y = 64 + index * 68;
  b.text(today, 20, y, row.time, { fill: TOKENS.accent, fontSize: 15, fontStyle: 'Bold' }, 'Время');
  b.text(today, 92, y, row.group, { fill: TOKENS.ink, fontSize: 14, fontStyle: 'Medium' }, 'Группа');
  b.text(today, 92, y + 20, row.branch, { fill: TOKENS.muted, fontSize: 12 }, 'Филиал');
  if (index < 2) {
    b.rect(today, 20, y + 50, 318, 1, { fill: TOKENS.line }, 'Разделитель');
  }
});

tabBar(overview);

// ---------------------------------------------------------------------------
// 2. Расписание
// ---------------------------------------------------------------------------
const schedule = b.frame(null, GAP, 0, W, H, { fill: TOKENS.canvas }, 'Mobile: Расписание');
appBar(schedule, 'Расписание');

['Пн 13', 'Вт 14', 'Ср 15', 'Чт 16', 'Пт 17', 'Сб 18', 'Вс 19'].forEach((day, index) => {
  const active = index === 1;
  const cell = b.frame(schedule, 16 + index * 52, 144, 48, 44, {
    fill: active ? TOKENS.accent : TOKENS.white,
    cornerRadius: 10,
  }, `День: ${day}`);

  b.text(cell, 6, 8, day, {
    fill: active ? TOKENS.white : TOKENS.muted,
    fontSize: 11,
    fontStyle: active ? 'Medium' : 'Regular',
  }, 'Подпись дня');
});

[
  { time: '09:00', group: 'Дети 4–6 лет', hall: 'Зал 2 · Петров П.П.' },
  { time: '10:30', group: 'Дети 7–10, новички', hall: 'Зал 1 · Иванов И.И.', active: true },
  { time: '12:00', group: 'Подростки, группа С', hall: 'Зал 1 · Смирнов А.А.' },
  { time: '18:00', group: 'Дети 7–10, новички', hall: 'Зал 1 · Иванов И.И.' },
  { time: '19:30', group: 'Взрослые, начинающие', hall: 'Зал 2 · Петров П.П.' },
].forEach((lesson, index) => {
  const y = 212 + index * 100;
  const card = b.frame(schedule, 16, y, 358, 84, {
    fill: lesson.active ? TOKENS.accentSoft : TOKENS.white,
    cornerRadius: 12,
  }, `Занятие: ${lesson.group}`);

  b.text(card, 16, 16, lesson.time, {
    fill: lesson.active ? TOKENS.accent : TOKENS.ink,
    fontSize: 14,
    fontStyle: 'Bold',
  }, 'Время');
  b.text(card, 16, 40, lesson.group, { fill: TOKENS.ink, fontSize: 13, fontStyle: 'Medium' }, 'Группа');
  b.text(card, 16, 60, lesson.hall, { fill: TOKENS.muted, fontSize: 11 }, 'Зал и тренер');

  if (lesson.active) {
    b.rect(card, 0, 0, 4, 84, { fill: TOKENS.accent }, 'Полоса');
  }
});

tabBar(schedule);

// ---------------------------------------------------------------------------
// 3. Журнал посещаемости
// ---------------------------------------------------------------------------
const journal = b.frame(null, GAP * 2, 0, W, H, { fill: TOKENS.canvas }, 'Mobile: Посещаемость');
appBar(journal, 'Журнал');

const lesson = b.frame(journal, 16, 144, 358, 96, { fill: TOKENS.white, cornerRadius: 12 }, 'Занятие');
b.text(lesson, 16, 16, 'Дети 7–10, новички', { fill: TOKENS.ink, fontSize: 15, fontStyle: 'Bold' }, 'Группа');
b.text(lesson, 16, 40, '14 мая 2024 · 18:00–19:30 · Зал 1', { fill: TOKENS.muted, fontSize: 12 }, 'Детали');
b.text(lesson, 16, 64, 'Присутствуют: 11 · Отсутствуют: 3', { fill: TOKENS.muted, fontSize: 12 }, 'Сводка');

const list = b.frame(journal, 16, 256, 358, 480, { fill: TOKENS.white, cornerRadius: 12 }, 'Список');
[
  { name: 'Кузнецов Макар', state: 'Был', tone: 'success' },
  { name: 'Смирнова Анна', state: 'Был', tone: 'success' },
  { name: 'Волков Артем', state: 'Не был', tone: 'danger' },
  { name: 'Григорьева София', state: 'Уважительная', tone: 'warning' },
  { name: 'Лебедев Иван', state: 'Не отмечено', tone: 'muted' },
].forEach((row, index) => {
  const y = 16 + index * 92;
  b.text(list, 16, y, row.name, { fill: TOKENS.ink, fontSize: 13, fontStyle: 'Medium' }, 'Спортсмен');

  const tone = {
    success: { bg: '#E8F5EE', fg: TOKENS.success },
    danger: { bg: '#FDECEC', fg: TOKENS.danger },
    warning: { bg: TOKENS.accentSoft, fg: TOKENS.accent },
    muted: { bg: TOKENS.canvas, fg: TOKENS.muted },
  }[row.tone];

  const chip = b.frame(list, 16, y + 26, 120, 28, { fill: tone.bg, cornerRadius: 14 }, `Статус: ${row.state}`);
  b.text(chip, 0, 6, row.state, { fill: tone.fg, fontSize: 11, fontStyle: 'Medium', textAlign: 'center' }, 'Текст статуса');

  if (index < 4) {
    b.rect(list, 16, y + 72, 326, 1, { fill: TOKENS.line }, 'Разделитель');
  }
});

tabBar(journal);

const count = writeScenario(new URL('./mobile.json', import.meta.url), b.steps);
console.log(`  экранов: 3, шагов: ${count}`);
