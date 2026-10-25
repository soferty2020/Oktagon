/**
 * Общие части экранов админки для FigCraft: сайдбар, шапка, карточки, таблицы.
 *
 * Вынесено отдельно, потому что три экрана повторяют одну рамку: если бы каждый
 * рисовал сайдбар сам, они разошлись бы по отступам при первой же правке.
 */
import { writeFileSync } from 'node:fs';

export const TOKENS = {
  ink: '#0E0E10',
  inkSoft: '#1A1A1E',
  accent: '#FF6B00',
  accentSoft: '#FFF0E5',
  canvas: '#F7F7F9',
  line: '#EDEDF0',
  muted: '#8A8A8F',
  white: '#FFFFFF',
  success: '#2E9E5B',
  danger: '#E23B3B',
};

export const NAV = [
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

/** Фабрика сценария: возвращает функции, замкнутые на общий массив шагов. */
export function createBuilder() {
  const steps = [];
  const ref = (step) => ({ $step: step });

  const add = (command, params) => {
    steps.push({ command, params });
    return steps.length - 1;
  };

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

  const text = (parent, x, y, value, props = {}, name) => {
    // Ширина слоя — не свойство `node.set`, а параметр `node.create`. Без неё
    // textAlign: center центрирует строку по её же ширине, и подпись в чипе
    // остаётся у левого края; переносим width в нужное место.
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

  /** Сайдбар с активным пунктом: плашка и полоса слева. */
  const sidebar = (parent, activeLabel) => {
    const bar = frame(parent, 0, 0, 248, 960, { fill: TOKENS.ink }, 'Сайдбар');

    text(bar, 24, 26, 'OCTAGON', {
      fill: TOKENS.white,
      fontSize: 18,
      fontStyle: 'Bold',
      letterSpacing: 3,
    }, 'Логотип');

    NAV.forEach((label, index) => {
      const y = 92 + index * 44;
      const isActive = label === activeLabel;

      if (isActive) {
        rect(bar, 8, y, 232, 40, { fill: TOKENS.inkSoft, cornerRadius: 6 }, 'Активный пункт');
        rect(bar, 0, y, 3, 40, { fill: TOKENS.accent }, 'Полоса');
      }

      text(bar, 24, y + 10, label, {
        fill: isActive ? TOKENS.white : '#A0A0A8',
        fontSize: 14,
        fontStyle: isActive ? 'Medium' : 'Regular',
      }, `Пункт: ${label}`);
    });

    return bar;
  };

  /** Шапка с хлебными крошками. */
  const header = (parent, section) => {
    const bar = frame(parent, 248, 0, 1192, 64, { fill: TOKENS.white }, 'Шапка');

    rect(bar, 0, 63, 1192, 1, { fill: TOKENS.line }, 'Разделитель');

    const brand = text(bar, 24, 23, 'OCTAGON', {
      fill: TOKENS.ink,
      fontSize: 14,
      fontStyle: 'Bold',
      letterSpacing: 2,
    }, 'Крошка: бренд');

    text(bar, 116, 23, '/', { fill: TOKENS.muted, fontSize: 14 }, 'Крошка: разделитель');
    text(bar, 134, 23, section, { fill: TOKENS.muted, fontSize: 14 }, 'Крошка: раздел');

    return { bar, brand };
  };

  const pageTitle = (parent, title, subtitle) => {
    text(parent, 272, 92, title, {
      fill: TOKENS.ink,
      fontSize: 24,
      fontStyle: 'Bold',
    }, 'Заголовок');

    text(parent, 272, 128, subtitle, {
      fill: TOKENS.muted,
      fontSize: 14,
    }, 'Описание');
  };

  const primaryButton = (parent, x, y, width, label) => {
    // Кнопка — фрейм, а не rectangle: прямоугольник не может содержать слой текста.
    const box = frame(parent, x, y, width, 40, { fill: TOKENS.accent, cornerRadius: 10 }, `Кнопка: ${label}`);

    // Текст по центру: ширина равна кнопке, иначе подпись прижимается влево и
    // «Сохранить» в диалоге выглядит смещённым.
    add('node.create', {
      type: 'text',
      parent: ref(box),
      x: 0,
      y: 12,
      width,
      text: label,
      name: 'Текст кнопки',
      props: {
        fill: TOKENS.white,
        fontSize: 14,
        fontStyle: 'Medium',
        fontFamily: 'Inter',
        textAlign: 'center',
      },
    });

    return box;
  };

  const card = (parent, x, y, width, height, title, subtitle) => {
    const box = frame(parent, x, y, width, height, { fill: TOKENS.white, cornerRadius: 12 }, `Карточка: ${title}`);

    text(box, 20, 18, title, {
      fill: TOKENS.ink,
      fontSize: 15,
      fontStyle: 'Bold',
    }, 'Заголовок карточки');

    if (subtitle) {
      text(box, 20, 42, subtitle, { fill: TOKENS.muted, fontSize: 12 }, 'Подпись карточки');
    }

    return box;
  };

  const badge = (parent, x, y, label, tone) => {
    const palette = {
      success: { bg: '#E8F5EE', fg: TOKENS.success },
      warning: { bg: TOKENS.accentSoft, fg: TOKENS.accent },
      danger: { bg: '#FDECEC', fg: TOKENS.danger },
    }[tone] ?? { bg: TOKENS.canvas, fg: TOKENS.muted };

    const width = 28 + label.length * 7;
    // Бейдж тоже фрейм: текст должен во что-то вкладываться.
    const box = frame(parent, x, y, width, 24, { fill: palette.bg, cornerRadius: 12 }, `Статус: ${label}`);

    text(box, 10, 5, label, {
      fill: palette.fg,
      fontSize: 12,
      fontStyle: 'Medium',
    }, 'Текст статуса');

    return box;
  };

  const searchField = (parent, x, y, width, placeholder) => {
    const box = frame(parent, x, y, width, 40, { fill: TOKENS.canvas, cornerRadius: 10 }, 'Поиск');

    text(box, 14, 12, placeholder, { fill: TOKENS.muted, fontSize: 13 }, 'Подсказка поиска');

    return box;
  };

  const filterChip = (parent, x, y, width, label) => {
    const box = frame(parent, x, y, width, 40, { fill: TOKENS.white, cornerRadius: 10, stroke: TOKENS.line, strokeWeight: 1 }, 'Фильтр');

    text(box, 14, 12, label, { fill: TOKENS.ink, fontSize: 13 }, 'Текст фильтра');

    return box;
  };

  return { steps, add, ref, rect, text, frame, sidebar, header, pageTitle, primaryButton, card, badge, searchField, filterChip };
}

/** Сохранить сценарий в JSON. */
export function writeScenario(path, steps) {
  writeFileSync(path, JSON.stringify(steps, null, 2), 'utf8');
  return steps.length;
}
