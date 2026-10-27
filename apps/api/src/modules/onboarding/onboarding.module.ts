import { Module } from '@nestjs/common';

import { AuditModule } from '../audit/audit.module';
import { IdentityModule } from '../identity/identity.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingRepository, PrismaOnboardingRepository } from './onboarding.repository';
import { OnboardingService } from './onboarding.service';

/**
 * Онбординг родителей (ADR-0015).
 *
 * IdentityModule нужен для scope-проверок: тренер выдаёт код только по своим
 * спортсменам. Без него PermissionsGuard не резолвит права — та же ошибка,
 * что была у заявок на пробную тренировку.
 */
@Module({
  imports: [AuditModule, IdentityModule],
  controllers: [OnboardingController],
  providers: [
    OnboardingService,
    { provide: OnboardingRepository, useClass: PrismaOnboardingRepository },
  ],
  exports: [OnboardingService],
})
export class OnboardingModule {}
