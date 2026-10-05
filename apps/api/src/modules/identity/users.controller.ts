import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PermissionCode, type PaginatedUsers } from '@octagon/contracts';

import { AuthGuard } from '../../shared/auth-stub';
import { PermissionsGuard, RequirePermissions } from '../../shared/permissions.guard';
import { IdentityService } from './identity.service';
import { ListUsersQueryDto } from './users.dto';

/**
 * Список пользователей (issue K2).
 *
 * Нужен админке, чтобы выдать индивидуальное право или связать аккаунт со
 * спортсменом: без списка выбирать аккаунт не из чего.
 *
 * Спецификация: docs/04-roles-permissions.md. Отдельного права на просмотр в
 * каталоге нет, поэтому доступ требует `users.manage` — тем самым список видят
 * только те, кто и так управляет пользователями.
 */
@ApiTags('users')
@ApiBearerAuth()
@UseGuards(AuthGuard, PermissionsGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly identity: IdentityService) {}

  @Get()
  @RequirePermissions(PermissionCode.UsersManage)
  @ApiOperation({ summary: 'Список пользователей с фильтрами и пагинацией' })
  @ApiOkResponse({ description: 'Страница пользователей' })
  list(@Query() query: ListUsersQueryDto): Promise<PaginatedUsers> {
    return this.identity.listUsers({
      role: query.role,
      status: query.status,
      search: query.search,
      page: query.page,
      perPage: query.perPage,
    });
  }
}
