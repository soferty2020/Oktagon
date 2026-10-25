/**
 * Планшетный дашборд и UI-kit.
 *
 * Планшет — 1024×768: та же сетка, но KPI в две колонки и сайдбар уже. UI-kit —
 * не экран приложения, а страница с токенами: цвета, шрифты, радиусы, кнопки и
 * поля, чтобы правки стиля сверялись по одному листу.
 */
import { createBuilder, writeScenario, TOKENS } from './lib.mjs';

const b = createBuilder();

// ---------------------------------------------------------------------------
// 1. Планшет 1024×768
// ---------------------------------------------------------------------------
const tablet = b.frame(null, 0, 0, 1024, 768, { fill: TOKENS.canvas }, 'Планшет: Обзор');

const tabletSidebar = b.frame(tablet, 0, 0, 200, 768, { fill: TOKENS.ink }, 'Сайдбар');
b.text(tabletSidebar, 20, 22, 'OCTAGON', { fill: TOKENS.white, fontSize: 15, fontStyle: 'Bold', letterSpacing: 3 }, 'Логотип');

['Обзор', 'Спортсмены', 'Группы', 'Тренеры', 'Филиалы и залы', 'Расписание', 'Посещаемость', 'Финансы', 'Новости', 'Чаты', 'Пользователи', 'Настройки'].forEach((label, index) => {
  const y = 76 + index * 38;
  const active = index === 0;

  if (active) {
    b.rect(tabletSidebar, 8, y, 184, 34, { fill: TOKENS.inkSoft, cornerRadius: 6 }, 'Активный пункт');
    b.rect(tabletSidebar, 0, y, 3, 34, { fill: TOKENS.accent }, 'Полоса');
  }

  b.text(tabletSidebar, 20, y + 9, label, {
    fill: active ? TOKENS.white : '#A0A0A8',
    fontSize: 13,
    fontStyle: active ? 'Medium' : 'Regular',
  }, `Пункт: ${label}`);
});

const tabletHeader = b.frame(tablet, 200, 0, 824, 56, { fill: TOKENS.white }, 'Шапка');
b.rect(tabletHeader, 0, 55, 824, 1, { fill: TOKENS.line }, 'Разделитель');
b.text(tabletHeader, 20, 19, 'OCTAGON', { fill: TOKENS.ink, fontSize: 12, fontStyle: 'Bold', letterSpacing: 2 }, 'Крошка: бренд');
b.text(tabletHeader, 96, 19, '/', { fill: TOKENS.muted, fontSize: 12 }, 'Крошка: разделитель');
b.text(tabletHeader, 110, 19, 'Обзор', { fill: TOKENS.muted, fontSize: 12 }, 'Крошка: раздел');

b.text(tablet, 220, 76, 'Обзор клуба', { fill: TOKENS.ink, fontSize: 22, fontStyle: 'Bold' }, 'Заголовок');
b.text(tablet, 220, 108, 'Спортсмены, занятия, финансы месяца', { fill: TOKENS.muted, fontSize: 13 }, 'Описание');

[
  { label: 'Спортсмены', value: '40', note: 'активных карточек' },
  { label: 'Выручка', value: '185 000 ₽', note: 'октябрь 2026' },
  { label: 'Задолженность', value: '15 000 ₽', note: 'требует внимания', accent: true },
  { label: 'Посещаемость', value: '87%', note: 'за 30 дней' },
].forEach((item, index) => {
  const column = index % 2;
  const rowIndex = Math.floor(index / 2);
  const card = b.frame(tablet, 220 + column * 396, 144 + rowIndex * 116, 380, 104, { fill: TOKENS.white, cornerRadius: 12 }, `KPI: ${item.label}`);

  b.rect(card, 20, 20, 2, 14, { fill: TOKENS.accent }, 'Полоса');
  b.text(card, 32, 18, item.label, { fill: TOKENS.muted, fontSize: 12 }, 'Подпись');
  b.text(card, 20, 40, item.value, {
    fill: item.accent ? TOKENS.accent : TOKENS.ink,
    fontSize: 22,
    fontStyle: 'Bold',
  }, 'Значение');
  b.text(card, 20, 74, item.note, { fill: TOKENS.muted, fontSize: 11 }, 'Примечание');
});

const tabletCard = b.frame(tablet, 220, 388, 776, 340, { fill: TOKENS.white, cornerRadius: 12 }, 'Карточка: посещаемость');
b.text(tabletCard, 20, 18, 'Посещаемость по группам', { fill: TOKENS.ink, fontSize: 14, fontStyle: 'Bold' }, 'Заголовок');

[
  { label: 'Младшая', value: 91, width: 480 },
  { label: 'Средняя', value: 84, width: 440 },
  { label: 'Старшая', value: 79, width: 410 },
  { label: 'Взрослые', value: 90, width: 470 },
].forEach((row, index) => {
  const y = 60 + index * 56;
  b.text(tabletCard, 20, y, row.label, { fill: TOKENS.ink, fontSize: 13 }, 'Группа');
  b.rect(tabletCard, 140, y + 3, 560, 8, { fill: TOKENS.canvas, cornerRadius: 4 }, 'Дорожка');
  b.rect(tabletCard, 140, y + 3, row.width, 8, { fill: TOKENS.accent, cornerRadius: 4 }, 'Заполнение');
  b.text(tabletCard, 716, y - 4, `${row.value}%`, { fill: TOKENS.muted, fontSize: 12 }, 'Процент');
});

// ---------------------------------------------------------------------------
// 2. UI-kit
// ---------------------------------------------------------------------------
const kit = b.frame(null, 1600, 0, 1440, 960, { fill: TOKENS.canvas }, 'UI-kit: основы');
b.text(kit, 40, 36, 'UI-kit: основы', { fill: TOKENS.ink, fontSize: 24, fontStyle: 'Bold' }, 'Заголовок');
b.text(kit, 40, 72, 'Цвета, типографика, радиусы, кнопки и поля', { fill: TOKENS.muted, fontSize: 13 }, 'Описание');

const palette = b.frame(kit, 40, 116, 660, 240, { fill: TOKENS.white, cornerRadius: 12 }, 'Палитра');
b.text(palette, 20, 16, 'Цвета', { fill: TOKENS.ink, fontSize: 14, fontStyle: 'Bold' }, 'Заголовок');

[
  { name: 'ink', value: TOKENS.ink, hex: '#0E0E10' },
  { name: 'accent', value: TOKENS.accent, hex: '#FF6B00' },
  { name: 'canvas', value: TOKENS.canvas, hex: '#F7F7F9' },
  { name: 'line', value: TOKENS.line, hex: '#EDEDF0' },
  { name: 'muted', value: TOKENS.muted, hex: '#8A8A8F' },
  { name: 'success', value: TOKENS.success, hex: '#2E9E5B' },
  { name: 'danger', value: TOKENS.danger, hex: '#E23B3B' },
  { name: 'inkSoft', value: TOKENS.inkSoft, hex: '#1A1A1E' },
].forEach((color, index) => {
  const column = index % 4;
  const rowIndex = Math.floor(index / 4);
  const x = 20 + column * 160;
  const y = 48 + rowIndex * 88;

  b.rect(palette, x, y, 56, 56, { fill: color.value, cornerRadius: 10, stroke: TOKENS.line, strokeWeight: 1 }, `Образец ${color.name}`);
  b.text(palette, x, y + 62, color.name, { fill: TOKENS.ink, fontSize: 11, fontStyle: 'Medium' }, 'Имя');
  b.text(palette, x, y + 76, color.hex, { fill: TOKENS.muted, fontSize: 10 }, 'HEX');
});

const typography = b.frame(kit, 720, 116, 680, 240, { fill: TOKENS.white, cornerRadius: 12 }, 'Типографика');
b.text(typography, 20, 16, 'Типографика', { fill: TOKENS.ink, fontSize: 14, fontStyle: 'Bold' }, 'Заголовок');

[
  { label: 'H1 · 24', size: 24, weight: 'Bold' },
  { label: 'H2 · 15', size: 15, weight: 'Bold' },
  { label: 'Текст · 13', size: 13, weight: 'Regular' },
  { label: 'Подпись · 12', size: 12, weight: 'Regular' },
].forEach((item, index) => {
  const y = 48 + index * 44;
  b.text(typography, 20, y, item.label, {
    fill: TOKENS.ink,
    fontSize: item.size,
    fontStyle: item.weight,
  }, `Стиль: ${item.label}`);
  b.text(typography, 400, y + 4, 'Inter', { fill: TOKENS.muted, fontSize: 11 }, 'Шрифт');
});

const radii = b.frame(kit, 40, 376, 660, 200, { fill: TOKENS.white, cornerRadius: 12 }, 'Радиусы');
b.text(radii, 20, 16, 'Радиусы', { fill: TOKENS.ink, fontSize: 14, fontStyle: 'Bold' }, 'Заголовок');

[
  { label: 'card · 12', radius: 12 },
  { label: 'control · 10', radius: 10 },
  { label: 'badge · full', radius: 999 },
].forEach((item, index) => {
  const x = 20 + index * 200;
  b.rect(radii, x, 48, 160, 80, { fill: TOKENS.canvas, cornerRadius: item.radius }, `Радиус: ${item.label}`);
  b.text(radii, x, 138, item.label, { fill: TOKENS.ink, fontSize: 11, fontStyle: 'Medium' }, 'Подпись');
});

const controls = b.frame(kit, 720, 376, 680, 260, { fill: TOKENS.white, cornerRadius: 12 }, 'Кнопки и поля');
b.text(controls, 20, 16, 'Кнопки и поля', { fill: TOKENS.ink, fontSize: 14, fontStyle: 'Bold' }, 'Заголовок');

const primary = b.frame(controls, 20, 48, 180, 44, { fill: TOKENS.accent, cornerRadius: 10 }, 'Кнопка: главная');
b.text(primary, 0, 13, 'Сохранить', { fill: TOKENS.white, fontSize: 14, textAlign: 'center', width: 180 }, 'Текст');

const secondary = b.frame(controls, 216, 48, 180, 44, { fill: TOKENS.canvas, cornerRadius: 10 }, 'Кнопка: вторичная');
b.text(secondary, 0, 13, 'Отмена', { fill: TOKENS.ink, fontSize: 14, textAlign: 'center', width: 180 }, 'Текст');

const field = b.frame(controls, 20, 116, 376, 44, { fill: TOKENS.canvas, cornerRadius: 10 }, 'Поле');
b.text(field, 14, 13, 'Поле ввода', { fill: TOKENS.muted, fontSize: 13 }, 'Подсказка');

const badgeSuccess = b.frame(controls, 20, 180, 96, 24, { fill: '#E8F5EE', cornerRadius: 12 }, 'Бейдж: успех');
b.text(badgeSuccess, 0, 5, 'Активен', { fill: TOKENS.success, fontSize: 11, textAlign: 'center', width: 96 }, 'Текст');

const badgeWarning = b.frame(controls, 128, 180, 106, 24, { fill: TOKENS.accentSoft, cornerRadius: 12 }, 'Бейдж: внимание');
b.text(badgeWarning, 0, 5, 'Заморожен', { fill: TOKENS.accent, fontSize: 11, textAlign: 'center', width: 106 }, 'Текст');

const badgeDanger = b.frame(controls, 246, 180, 116, 24, { fill: '#FDECEC', cornerRadius: 12 }, 'Бейдж: долг');
b.text(badgeDanger, 0, 5, 'Задолженность', { fill: TOKENS.danger, fontSize: 11, textAlign: 'center', width: 116 }, 'Текст');

const count = writeScenario(new URL('./extra.json', import.meta.url), b.steps);
console.log(`  экранов: 2, шагов: ${count}`);
