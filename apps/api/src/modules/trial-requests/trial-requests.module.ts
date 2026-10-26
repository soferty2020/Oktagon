import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { IdentityModule } from '../identity/identity.module';
import { PrismaModule } from '../../prisma/prisma.module';
import { PublicTrialRequestsController, TrialRequestsController } from './trial-requests.controller';
import { TrialRequestsRepository } from './trial-requests.repository';
import { TrialRequestsService } from './trial-requests.service';

/**
 * Заявки на пробную тренировку (ADR-0013, #25).
 *
 * Публичная форма и админский список живут в одном модуле, но в разных
 * контроллерах: у первого нет guard'ов вообще, у второго — права администратора.
 */
@Module({
  // IdentityModule даёт PermissionsGuard и PermissionResolver: без него контроллер
  // с правами не поднимается вовсе.
  imports: [PrismaModule, AuthModule, IdentityModule],
  controllers: [PublicTrialRequestsController, TrialRequestsController],
  providers: [TrialRequestsRepository, TrialRequestsService],
  exports: [TrialRequestsService],
})
export class TrialRequestsModule {}
