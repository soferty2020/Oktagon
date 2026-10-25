/**
 * Оставшиеся мобильные экраны: спортсмены, финансы, настройки.
 *
 * Та же сетка, что в build-mobile: тёмная шапка, карточки, таб-бар внизу.
 */
import { createBuilder, writeScenario, TOKENS } from './lib.mjs';

const b = createBuilder();
const GAP = 500;
const W = 390;
const H = 844;

function appBar(parent, title) {
  const bar = b.frame(parent, 0, 0, W, 80, { fill: TOKENS.ink }, 'Шапка');

  b.text(bar, 20, 24, 'OCTAGON', { fill: TOKENS.white, fontSize: 17, fontStyle: 'Bold', letterSpacing: 2 }, 'Логотип');
  b.text(bar, 20, 48, 'ADMIN', { fill: TOKENS.accent, fontSize: 10, fontStyle: 'Bold', letterSpacing: 2 }, 'Подпись');

  [0, 1, 2].forEach((index) => {
    b.rect(bar, 344, 32 + index * 6, 22, 2, { fill: TOKENS.white, cornerRadius: 1 }, 'Полоса меню');
  });

  if (title) {
    b.text(parent, 20, 104, title, { fill: TOKENS.ink, fontSize: 22, fontStyle: 'Bold' }, 'Заголовок');
  }

  return bar;
}

function tabBar(parent, active) {
  const bar = b.frame(parent, 0, H - 64, W, 64, { fill: TOKENS.white }, 'Таб-бар');
  b.rect(bar, 0, 0, W, 1, { fill: TOKENS.line }, 'Разделитель');

  ['Обзор', 'Группы', 'Журнал', 'Ещё'].forEach((label, index) => {
    b.text(bar, 20 + index * 92, 26, label, {
      fill: label === active ? TOKENS.accent : TOKENS.muted,
      fontSize: 12,
      fontStyle: label === active ? 'Medium' : 'Regular',
    }, `Вкладка: ${label}`);
  });

  return bar;
}

// ---------------------------------------------------------------------------
// 1. Спортсмены
// ---------------------------------------------------------------------------
const athletes = b.frame(null, 0, 0, W, H, { fill: TOKENS.canvas }, 'Mobile: Спортсмены');
appBar(athletes, 'Спортсмены');

const search = b.frame(athletes, 16, 144, 358, 44, { fill: TOKENS.white, cornerRadius: 10 }, 'Поиск');
b.text(search, 14, 13, 'Поиск по имени', { fill: TOKENS.muted, fontSize: 13 }, 'Подсказка');

const list = b.frame(athletes, 16, 204, 358, 560, { fill: TOKENS.white, cornerRadius: 12 }, 'Список');
[
  { name: 'Иванов Максим', group: 'Дети 7–10', status: 'Активен', tone: 'success' },
  { name: 'Петров Алексей', group: 'Подростки', status: 'Активен', tone: 'success' },
  { name: 'Сидорова Анна', group: 'Дети 5–7', status: 'Активен', tone: 'success' },
  { name: 'Кузнецов Иван', group: 'Дети 7–10', status: 'Заморожен', tone: 'warning' },
  { name: 'Смирнова Мария', group: 'Дети 5–7', status: 'Активен', tone: 'success' },
].forEach((athlete, index) => {
  const y = 16 + index * 100;
  b.text(list, 16, y, athlete.name, { fill: TOKENS.ink, fontSize: 14, fontStyle: 'Medium' }, 'Имя');
  b.text(list, 16, y + 22, athlete.group, { fill: TOKENS.muted, fontSize: 12 }, 'Группа');

  const tone = athlete.tone === 'success'
    ? { bg: '#E8F5EE', fg: TOKENS.success }
    : { bg: TOKENS.accentSoft, fg: TOKENS.accent };

  const badge = b.frame(list, 236, y + 4, 106, 24, { fill: tone.bg, cornerRadius: 12 }, 'Статус');
  b.text(badge, 0, 5, athlete.status, { fill: tone.fg, fontSize: 11, textAlign: 'center', width: 106 }, 'Текст');

  if (index < 4) {
    b.rect(list, 16, y + 84, 326, 1, { fill: TOKENS.line }, 'Разделитель');
  }
});

tabBar(athletes, 'Ещё');

// ---------------------------------------------------------------------------
// 2. Финансы
// ---------------------------------------------------------------------------
const finance = b.frame(null, GAP, 0, W, H, { fill: TOKENS.canvas }, 'Mobile: Финансы');
appBar(finance, 'Финансы');

[
  { label: 'Поступления', value: '185 000 ₽', accent: false },
  { label: 'Задолженность', value: '15 000 ₽', accent: true },
].forEach((item, index) => {
  const card = b.frame(finance, 16 + index * 183, 144, 175, 96, { fill: TOKENS.white, cornerRadius: 12 }, `KPI: ${item.label}`);
  b.text(card, 14, 14, item.label, { fill: TOKENS.muted, fontSize: 12 }, 'Подпись');
  b.text(card, 14, 42, item.value, {
    fill: item.accent ? TOKENS.accent : TOKENS.ink,
    fontSize: 20,
    fontStyle: 'Bold',
  }, 'Значение');
});

const periods = b.frame(finance, 16, 256, 358, 500, { fill: TOKENS.white, cornerRadius: 12 }, 'Периоды');
b.text(periods, 16, 16, 'Расчётные периоды', { fill: TOKENS.ink, fontSize: 15, fontStyle: 'Bold' }, 'Заголовок');
b.text(periods, 16, 40, 'Октябрь 2026', { fill: TOKENS.muted, fontSize: 12 }, 'Период');

[
  { name: 'Иванов Максим', paid: '5 000 ₽', status: 'Оплачен', tone: 'success' },
  { name: 'Сидорова Анна', paid: '2 500 ₽', status: 'Частично', tone: 'warning' },
  { name: 'Смирнова Мария', paid: '0 ₽', status: 'Долг', tone: 'danger' },
].forEach((row, index) => {
  const y = 72 + index * 100;
  b.text(periods, 16, y, row.name, { fill: TOKENS.ink, fontSize: 13, fontStyle: 'Medium' }, 'Спортсмен');
  b.text(periods, 16, y + 22, row.paid, { fill: TOKENS.muted, fontSize: 12 }, 'Оплачено');

  const tone = {
    success: { bg: '#E8F5EE', fg: TOKENS.success },
    warning: { bg: TOKENS.accentSoft, fg: TOKENS.accent },
    danger: { bg: '#FDECEC', fg: TOKENS.danger },
  }[row.tone];

  const badge = b.frame(periods, 232, y + 4, 106, 24, { fill: tone.bg, cornerRadius: 12 }, 'Статус');
  b.text(badge, 0, 5, row.status, { fill: tone.fg, fontSize: 11, textAlign: 'center', width: 106 }, 'Текст');

  if (index < 2) {
    b.rect(periods, 16, y + 84, 326, 1, { fill: TOKENS.line }, 'Разделитель');
  }
});

tabBar(finance, 'Ещё');

// ---------------------------------------------------------------------------
// 3. Настройки
// ---------------------------------------------------------------------------
const settings = b.frame(null, GAP * 2, 0, W, H, { fill: TOKENS.canvas }, 'Mobile: Настройки');
appBar(settings, 'Настройки');

const menu = b.frame(settings, 16, 144, 358, 500, { fill: TOKENS.white, cornerRadius: 12 }, 'Разделы');
[
  { title: 'Профиль клуба', text: 'Название, логотип, контакты' },
  { title: 'Сотрудники и права', text: 'Приглашения и выдача прав' },
  { title: 'Финансы', text: 'Правила задолженности' },
  { title: 'Журнал действий', text: 'Кто и что изменил' },
].forEach((item, index) => {
  const y = 16 + index * 112;
  b.text(menu, 16, y, item.title, { fill: TOKENS.ink, fontSize: 14, fontStyle: 'Medium' }, 'Заголовок');
  b.text(menu, 16, y + 24, item.text, { fill: TOKENS.muted, fontSize: 12 }, 'Описание');
  b.text(menu, 310, y, '→', { fill: TOKENS.muted, fontSize: 18 }, 'Стрелка');

  if (index < 3) {
    b.rect(menu, 16, y + 92, 326, 1, { fill: TOKENS.line }, 'Разделитель');
  }
});

tabBar(settings, 'Ещё');

const count = writeScenario(new URL('./mobile-more.json', import.meta.url), b.steps);
console.log(`  экранов: 3, шагов: ${count}`);
