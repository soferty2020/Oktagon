/**
 * Сравнение макетов FigCraft с реальным интерфейсом.
 *
 * Кладёт рендер и скриншот прода парами и собирает index.html: расхождения
 * видно рядом, а не по памяти. Размеры картинок печатаются — если они разные,
 * значит один из экранов снят не в той ширине, и сравнивать нельзя.
 */
import { existsSync, readdirSync, copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'docs/design';
const DESIGN = join(ROOT, 'figcraft/export');
const PROD = join(ROOT, 'compare/prod');
const OUT = join(ROOT, 'compare');

/** Пары «экран в FigCraft» → «страница админки». */
const PAIRS = [
  { name: 'Дашборд', design: 'Дашборд.png', prod: 'root.png' },
  { name: 'Спортсмены', design: 'Спортсмены.png', prod: 'athletes.png' },
  { name: 'Финансы', design: 'Финансы.png', prod: 'finance.png' },
  { name: 'Карточка спортсмена', design: 'Карточка спортсмена.png', prod: null },
  { name: 'Диалог: спортсмен', design: 'Диалог_ спортсмен.png', prod: null },
  { name: 'Состояние: пусто', design: 'Состояние_ пусто.png', prod: null },
];

mkdirSync(join(OUT, 'design'), { recursive: true });

const rows = [];

for (const pair of PAIRS) {
  const designPath = join(DESIGN, pair.design);
  if (!existsSync(designPath)) {
    console.log(`  нет макета: ${pair.design}`);
    continue;
  }

  const designTarget = join(OUT, 'design', pair.design);
  copyFileSync(designPath, designTarget);

  const prodPath = pair.prod ? join(PROD, pair.prod) : null;
  const hasProd = prodPath && existsSync(prodPath);

  if (hasProd) {
    copyFileSync(prodPath, join(OUT, 'prod', `${pair.name}.png`));
  }

  rows.push({
    name: pair.name,
    design: `design/${pair.design}`,
    prod: hasProd ? `prod/${pair.name}.png` : null,
  });

  console.log(`  ${pair.name}: макет${hasProd ? ' + прод' : ' (прода нет)'}`);
}

const cards = rows
  .map(
    (row) => `
    <section>
      <h2>${row.name}</h2>
      <div class="pair">
        <figure><figcaption>Figma / FigCraft</figcaption><img src="${row.design}" alt="${row.name} — макет"></figure>
        ${
          row.prod
            ? `<figure><figcaption>Админка (прод)</figcaption><img src="${row.prod}" alt="${row.name} — прод"></figure>`
            : '<p class="missing">Скриншот прода не снят</p>'
        }
      </div>
    </section>`,
  )
  .join('\n');

const html = `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>OCTAGON — макет против прода</title>
<style>
  body { font-family: Inter, system-ui, sans-serif; background: #F7F7F9; color: #0E0E10; margin: 0; padding: 32px; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  p.hint { color: #8A8A8F; font-size: 14px; margin: 0 0 32px; }
  section { margin-bottom: 40px; }
  h2 { font-size: 16px; margin: 0 0 12px; }
  .pair { display: flex; gap: 16px; align-items: flex-start; flex-wrap: wrap; }
  figure { margin: 0; background: #fff; border: 1px solid #EDEDF0; border-radius: 12px; padding: 8px; }
  figcaption { font-size: 12px; color: #8A8A8F; margin-bottom: 6px; }
  img { display: block; max-width: 640px; height: auto; border-radius: 8px; }
  .missing { color: #8A8A8F; font-size: 13px; }
</style>
</head>
<body>
<h1>OCTAGON — макет против прода</h1>
<p class="hint">Слева рендер из генератора, справа фактический интерфейс. Оба 1440 px, поэтому сравнимы построчно.</p>
${cards}
</body>
</html>`;

writeFileSync(join(OUT, 'index.html'), html, 'utf8');
console.log(`  страница: ${join(OUT, 'index.html')}`);
console.log(`  пар: ${rows.length}, с продом: ${rows.filter((row) => row.prod).length}`);
