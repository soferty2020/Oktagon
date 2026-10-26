/**
 * Отчёт о неоднозначностях после перехода на единую ступень (ADR-0012, #31).
 *
 * Миграция заполняет `rank` только там, где ступень выводится однозначно. Всё
 * остальное она оставляет пустым — и это правильно, но бесполезно, если никто не
 * увидит список. Скрипт показывает записи, которые требуют ручного решения, и
 * противоречия между поясом и ступенью.
 *
 * Запуск: pnpm --filter @octagon/api ranks:report
 */
import { PrismaClient } from '../generated/prisma';
import { BELT_GRADES, RANKS, beltForRank } from '@octagon/contracts';

const prisma = new PrismaClient();

/** Подпись пояса по коду; для неизвестного кода — сам код. */
function beltLabel(code: string): string {
  return BELT_GRADES.find((grade) => grade.code === code)?.label ?? code;
}

/** Подпись ступени по идентификатору. */
function rankText(id: string | null): string {
  if (!id) {
    return 'не определена';
  }

  return RANKS.find((rank) => rank.id === id)?.label ?? id;
}

async function main(): Promise<void> {
  const athletesWithoutRank = await prisma.athlete.findMany({
    where: { rank: null },
    select: { id: true, lastName: true, firstName: true, beltGrade: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });

  const certificationsWithoutRank = await prisma.certification.findMany({
    where: { rank: null },
    select: {
      id: true,
      athleteId: true,
      certifiedOn: true,
      stageKind: true,
      stageNumber: true,
      beltGrade: true,
    },
  });

  const athletes = await prisma.athlete.findMany({
    where: { rank: { not: null } },
    select: { id: true, lastName: true, firstName: true, rank: true, beltGrade: true },
  });

  const certifications = await prisma.certification.findMany({
    where: { rank: { not: null } },
    select: { id: true, athleteId: true, rank: true, beltGrade: true },
  });

  // Противоречие: пояс в записи не совпадает с поясом, который следует из ступени.
  const athleteMismatches = athletes.filter((athlete) => {
    const expected = beltForRank(athlete.rank);
    return expected !== undefined && expected !== athlete.beltGrade;
  });

  const certificationMismatches = certifications.filter((certification) => {
    const expected = beltForRank(certification.rank);
    return expected !== undefined && expected !== certification.beltGrade;
  });

  console.log('=== Отчёт по ступеням (ADR-0012) ===\n');

  console.log(`Спортсменов без ступени: ${athletesWithoutRank.length}`);
  for (const athlete of athletesWithoutRank) {
    console.log(
      `  ${athlete.lastName} ${athlete.firstName} — пояс «${beltLabel(athlete.beltGrade)}» без аттестации; ступень не выводится из пояса`,
    );
  }

  console.log(`\nАттестаций без ступени: ${certificationsWithoutRank.length}`);
  for (const certification of certificationsWithoutRank) {
    console.log(
      `  ${certification.id} — ${certification.stageKind} ${certification.stageNumber}, ${certification.certifiedOn.toISOString().slice(0, 10)}`,
    );
  }

  console.log(`\nНесоответствий пояса и ступени у спортсменов: ${athleteMismatches.length}`);
  for (const athlete of athleteMismatches) {
    console.log(
      `  ${athlete.lastName} ${athlete.firstName} — ступень ${rankText(athlete.rank)}, пояс «${beltLabel(athlete.beltGrade)}»`,
    );
  }

  console.log(`\nНесоответствий пояса и ступени в аттестациях: ${certificationMismatches.length}`);
  for (const certification of certificationMismatches) {
    console.log(
      `  ${certification.id} — ступень ${rankText(certification.rank)}, пояс «${beltLabel(certification.beltGrade)}»`,
    );
  }

  const total = athletesWithoutRank.length + certificationsWithoutRank.length;
  if (total === 0 && athleteMismatches.length === 0 && certificationMismatches.length === 0) {
    console.log('\nНеоднозначностей нет: все записи согласованы со справочником.');
  } else {
    console.log('\nРазрешение: проставить ступень вручную через админку или миграцию, не угадывая.');
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
