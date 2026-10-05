import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { LinkedAthlete, UserProfile } from '@octagon/contracts';

import { AuthGuard, CurrentUser, type AuthenticatedUser } from '../../shared/auth-stub';
import { IdentityService } from './identity.service';

/**
 * Эндпоинты текущего пользователя (docs/23-api-contract-plan.md).
 *
 * Форма ответов зафиксирована в ADR-0007: профиль и список связанных
 * спортсменов разделены.
 */
@ApiTags('identity')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller()
export class IdentityController {
  constructor(private readonly identity: IdentityService) {}

  @Get('me')
  @ApiOperation({ summary: 'Профиль текущего пользователя и его эффективные права' })
  @ApiOkResponse({ description: 'Профиль пользователя' })
  getMe(@CurrentUser() user: AuthenticatedUser): Promise<UserProfile> {
    return this.identity.getProfile(user.id);
  }

  @Get('me/athletes')
  @ApiOperation({ summary: 'Спортсмены, связанные с аккаунтом (переключатель в приложении)' })
  @ApiOkResponse({ description: 'Список связанных спортсменов' })
  getMyAthletes(@CurrentUser() user: AuthenticatedUser): Promise<LinkedAthlete[]> {
    return this.identity.listLinkedAthletes(user.id);
  }
}
