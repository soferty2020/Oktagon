import { Injectable } from '@nestjs/common';
import { UserRole, UserStatus } from '../../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';

/** Минимум данных пользователя, нужный для проверки входа. */
export interface AuthUserRecord {
  id: string;
  email: string;
  passwordHash: string | null;
  role: UserRole;
  status: UserStatus;
}

/**
 * Доступ к данным аутентификации.
 *
 * Абстрактный класс как DI-токен: AuthService не зависит от Prisma, поэтому
 * логика входа тестируется без БД (docs/13-architecture.md).
 */
export abstract class AuthRepository {
  /** Ищет активного (не архивированного) пользователя по email. */
  abstract findUserForAuth(email: string): Promise<AuthUserRecord | null>;
  /** Ищет активного пользователя по идентификатору (обновление сессии). */
  abstract findUserById(userId: string): Promise<AuthUserRecord | null>;
  /** Фиксирует время успешного входа. */
  abstract markLogin(userId: string): Promise<void>;
}

@Injectable()
export class PrismaAuthRepository extends AuthRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findUserForAuth(email: string): Promise<AuthUserRecord | null> {
    return this.prisma.db.user.findFirst({
      where: { email: email.trim().toLowerCase(), archivedAt: null },
      select: { id: true, email: true, passwordHash: true, role: true, status: true },
    });
  }

  async findUserById(userId: string): Promise<AuthUserRecord | null> {
    return this.prisma.db.user.findFirst({
      where: { id: userId, archivedAt: null },
      select: { id: true, email: true, passwordHash: true, role: true, status: true },
    });
  }

  async markLogin(userId: string): Promise<void> {
    await this.prisma.db.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });
  }
}
