import { Injectable } from '@nestjs/common';

/**
 * Заготовка модуля freezes.
 *
 * Спецификация: BR-005, docs/08-database.md (один открытый период на спортсмена), docs/22-erd.md (FreezePeriod).
 * Публичный контракт модуля согласуется до реализации
 * (docs/24-multi-agent-plan.md: contracts-first).
 */
@Injectable()
export class FreezesService {}
