import { Module } from '@nestjs/common';

import { IdentityModule } from '../identity/identity.module';
import { FreezeCloseController, FreezesController } from './freezes.controller';
import { FreezeRepository, PrismaFreezeRepository } from './freezes.repository';
import { FreezesService } from './freezes.service';

/**
 * Заморозки (эпик F, BR-005).
 *
 * Спецификация: BR-005 (открытый период приостановления; начало и завершение
 * можно внести задним числом), docs/08-database.md (один открытый период на
 * спортсмена), docs/22-erd.md (FreezePeriod), BR-010.
 *
 * Заморозки вынесены в отдельный модуль, а не в finance: это самостоятельный
 * сценарий с собственными правами (`freezes.view` / `freezes.edit`). При этом
 * задолженность (BR-004) учитывает их — FinanceService читает заморозки через
 * свой репозиторий, чтобы модули не зависели друг от друга.
 */
@Module({
  imports: [IdentityModule],
  controllers: [FreezesController, FreezeCloseController],
  providers: [
    FreezesService,
    PrismaFreezeRepository,
    { provide: FreezeRepository, useExisting: PrismaFreezeRepository },
  ],
  exports: [FreezesService, FreezeRepository],
})
export class FreezesModule {}
