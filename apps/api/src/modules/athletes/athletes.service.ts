import { Injectable } from '@nestjs/common';

/**
 * Заготовка модуля athletes.
 *
 * Спецификация: docs/07-domain-model.md, docs/22-erd.md (Athlete, UserAthlete), docs/00-project-overview.md (аккаунт != карточка спортсмена).
 * Публичный контракт модуля согласуется до реализации
 * (docs/24-multi-agent-plan.md: contracts-first).
 */
@Injectable()
export class AthletesService {}
