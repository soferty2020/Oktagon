import { Injectable } from '@nestjs/common';

/**
 * Заготовка модуля identity.
 *
 * Спецификация: docs/04-roles-permissions.md, docs/21-permission-matrix.md, docs/22-erd.md (User, Permission, UserPermission, UserInvite).
 * Публичный контракт модуля согласуется до реализации
 * (docs/24-multi-agent-plan.md: contracts-first).
 */
@Injectable()
export class IdentityService {}
