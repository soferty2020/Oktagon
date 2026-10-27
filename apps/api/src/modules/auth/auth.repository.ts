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

/** Данные, которые пользователь задает при принятии приглашения. */
export interface ActivateFromInviteInput {
  email: string;
  passwordHash: string;
  role: UserRole;
  firstName: string;
  lastName: string;
  middleName?: string;
  phone?: string;
}

/** Данные самостоятельной регистрации (ADR-0015): роль всегда MEMBER. */
export interface RegisterUserInput {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
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
  /**
   * Активирует пользователя по приглашению: задает пароль, роль и профиль.
   *
   * Если запись уже создана приглашением (status INVITED), она активируется;
   * иначе создается новая.
   */
  abstract activateFromInvite(input: ActivateFromInviteInput): Promise<AuthUserRecord>;
  /**
   * Создаёт пользователя самостоятельной регистрацией (ADR-0015).
   *
   * Роль всегда MEMBER: регистрация не выдаёт прав. Существование адреса
   * проверяется отдельно и внутри транзакции — иначе два одновременных запроса
   * на один email дадут второй пользователь с тем же адресом.
   */
  abstract register(input: RegisterUserInput): Promise<AuthUserRecord>;
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

  async activateFromInvite(input: ActivateFromInviteInput): Promise<AuthUserRecord> {
    const email = input.email.trim().toLowerCase();
    const profile = {
      passwordHash: input.passwordHash,
      role: input.role,
      status: UserStatus.ACTIVE,
      firstName: input.firstName,
      lastName: input.lastName,
      middleName: input.middleName ?? null,
      phone: input.phone ?? null,
    };
    const select = {
      id: true,
      email: true,
      passwordHash: true,
      role: true,
      status: true,
    };

    const existing = await this.prisma.db.user.findFirst({
      where: { email, archivedAt: null },
      select: { id: true, status: true },
    });

    if (existing) {
      // Роль не меняется: приглашение не должно повышать права уже
      // существующего пользователя.
      return this.prisma.db.user.update({
        where: { id: existing.id },
        data: {
          passwordHash: profile.passwordHash,
          status: profile.status,
          firstName: profile.firstName,
          lastName: profile.lastName,
          middleName: profile.middleName,
          phone: profile.phone,
        },
        select,
      });
    }

    return this.prisma.db.user.create({ data: { email, ...profile }, select });
  }

  async register(input: RegisterUserInput): Promise<AuthUserRecord> {
    return this.prisma.db.user.create({
      data: {
        email: input.email.trim().toLowerCase(),
        passwordHash: input.passwordHash,
        role: UserRole.MEMBER,
        status: UserStatus.ACTIVE,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        phone: input.phone?.trim() || null,
      },
      select: { id: true, email: true, passwordHash: true, role: true, status: true },
    });
  }
}
