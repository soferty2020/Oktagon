import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ClubProfileView } from '@octagon/contracts';

import { AuthGuard, CurrentUser, type AuthenticatedUser } from '../../shared/auth-stub';
import { SuperadminGuard } from '../../shared/superadmin.guard';
import { UpdateClubProfileDto } from './settings.dto';
import { SettingsService } from './settings.service';

/**
 * Настройки клуба (K1, docs/26-admin-settings.md).
 *
 * Доступ закрыт SuperadminGuard: роль, а не право. Документ требует, чтобы
 * индивидуально выданные grants не открывали настройки — проверка по permissions
 * здесь пропустила бы STAFF с grant'ом.
 */
@ApiTags('settings')
@ApiBearerAuth()
@UseGuards(AuthGuard, SuperadminGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('club')
  @ApiOperation({ summary: 'Профиль клуба' })
  @ApiOkResponse({ description: 'Название, логотип, контакты и часовой пояс' })
  getClubProfile(): Promise<ClubProfileView> {
    return this.settings.getClubProfile();
  }

  @Patch('club')
  @ApiOperation({ summary: 'Изменить профиль клуба' })
  @ApiOkResponse({ description: 'Сохраненный профиль; изменение записано в аудит' })
  updateClubProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateClubProfileDto,
  ): Promise<ClubProfileView> {
    return this.settings.updateClubProfile(user.id, {
      name: dto.name,
      logoUrl: dto.logoUrl,
      phone: dto.phone,
      email: dto.email,
      address: dto.address,
      timezone: dto.timezone,
    });
  }
}
