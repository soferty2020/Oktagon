import { BELT_GRADES, BeltGrade, beltGradeLabel, findBeltGrade } from '@octagon/contracts';

import { BeltGradesController } from './belt-grades.controller';

/**
 * Справочник поясов (K3, BR-015).
 *
 * Набор фиксирован и утверждён клубом: порядок и подписи — часть бизнес-правила,
 * поэтому тест защищает их от случайной правки. Перестановка двух соседних
 * поясов означает другую ступень, а не косметику.
 */
describe('справочник поясов', () => {
  it('содержит 12 поясов, утверждённых клубом', () => {
    expect(BELT_GRADES).toHaveLength(12);
  });

  it('идет по возрастанию ступени без пропусков', () => {
    expect(BELT_GRADES.map((grade) => grade.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it('начинается белым и заканчивается чёрным', () => {
    expect(BELT_GRADES[0].code).toBe(BeltGrade.WHITE);
    expect(BELT_GRADES[11].code).toBe(BeltGrade.BLACK);
  });

  it('не содержит повторяющихся кодов', () => {
    const codes = new Set(BELT_GRADES.map((grade) => grade.code));
    expect(codes.size).toBe(BELT_GRADES.length);
  });

  it('соблюдает порядок полосок киокушина', () => {
    // Ключевые пары: если порядок перепутан, пояс окажется на другой ступени.
    expect(BELT_GRADES[1].code).toBe(BeltGrade.ORANGE);
    expect(BELT_GRADES[2].code).toBe(BeltGrade.ORANGE_BLUE_STRIPE);
    expect(BELT_GRADES[7].code).toBe(BeltGrade.GREEN);
    expect(BELT_GRADES[8].code).toBe(BeltGrade.GREEN_BROWN_STRIPE);
  });

  it('задает цвет полоски только поясам с полоской', () => {
    const striped = BELT_GRADES.filter((grade) => grade.stripeColor !== null);

    expect(striped.map((grade) => grade.code)).toEqual([
      BeltGrade.ORANGE_BLUE_STRIPE,
      BeltGrade.BLUE_YELLOW_STRIPE,
      BeltGrade.YELLOW_GREEN_STRIPE,
      BeltGrade.GREEN_BROWN_STRIPE,
      BeltGrade.BROWN_GOLD_STRIPE,
    ]);
  });

  it('находит пояс по коду и подпись по коду', () => {
    expect(findBeltGrade(BeltGrade.BLACK)?.label).toBe('Чёрный');
    expect(beltGradeLabel(BeltGrade.YELLOW_GREEN_STRIPE)).toBe('Жёлтый с зелёной полоской');
  });

  it('не подставляет пояс, если значения нет', () => {
    expect(findBeltGrade(null)).toBeUndefined();
    expect(beltGradeLabel(null)).toBeNull();
    expect(beltGradeLabel(undefined)).toBeNull();
  });

  it('отдает справочник только для чтения', () => {
    // Контроллер не имеет методов изменения: acceptance требует, чтобы мутации
    // отклонялись, а не просто были скрыты в интерфейсе.
    const controller = new BeltGradesController();
    const grades = controller.list();

    expect(grades).toBe(BELT_GRADES);
    expect(Object.getOwnPropertyNames(BeltGradesController.prototype).sort()).toEqual([
      'constructor',
      'list',
    ]);
  });
});
