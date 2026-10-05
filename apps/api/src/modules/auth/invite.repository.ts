import { Injectable } from '@nestjs/common';
import { UserRole } from '../../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.service';

export interface InviteRecord {
  id: string;
  email: string;
  role: UserRole;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
  usedBy: string | null;
  createdAt: Date;
  createdBy: string;
}

/**
 * Доступ к данным приглашений.
 *
 * Абстрактный класс как DI-токен: InviteService не зависит от Prisma и
 * тестируется без БД (docs/13-architecture.md).
 */
export abstract class InviteRepository {
  abstract create(input: {
    email: string;
    role: UserRole;
    tokenHash: string;
    expiresAt: Date;
    createdBy: string;
  }): Promise<InviteRecord>;
  abstract findByTokenHash(tokenHash: string): Promise<InviteRecord | null>;
  abstract findById(id: string): Promise<InviteRecord | null>;
  /** Отзывает все неиспользованные приглашения на адрес (перевыпуск). */
  abstract revokePendingForEmail(email: string): Promise<number>;
  /**
   * Атомарно гасит приглашение. Возвращает true, только если именно этот вызов
   * перевел его из неиспользованного в использованное: защищает от гонки при
   * одновременном принятии.
   */
  abstract consume(id: string): Promise<boolean>;
  /** Записывает, кто принял приглашение. */
  abstract attachConsumer(id: string, usedBy: string): Promise<void>;
  abstract listPending(email?: string): Promise<InviteRecord[]>;
}

const INVITE_SELECT = {
  id: true,
  email: true,
  role: true,
  tokenHash: true,
  expiresAt: true,
  usedAt: true,
  usedBy: true,
  createdAt: true,
  createdBy: true,
} as const;

@Injectable()
export class PrismaInviteRepository extends InviteRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async create(input: {
    email: string;
    role: UserRole;
    tokenHash: string;
    expiresAt: Date;
    createdBy: string;
  }): Promise<InviteRecord> {
    return this.prisma.db.userInvite.create({
      data: {
        email: input.email,
        role: input.role,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        createdBy: input.createdBy,
      },
      select: INVITE_SELECT,
    });
  }

  async findByTokenHash(tokenHash: string): Promise<InviteRecord | null> {
    return this.prisma.db.userInvite.findFirst({
      where: { tokenHash },
      select: INVITE_SELECT,
    });
  }

  async findById(id: string): Promise<InviteRecord | null> {
    return this.prisma.db.userInvite.findUnique({ where: { id }, select: INVITE_SELECT });
  }

  async revokePendingForEmail(email: string): Promise<number> {
    // «Отзыв» неиспользованного приглашения — это его погашение: помечаем
    // usedAt, чтобы токен перестал работать. Отдельного статуса в схеме нет.
    const result = await this.prisma.db.userInvite.updateMany({
      where: { email, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    return result.count;
  }

  async consume(id: string): Promise<boolean> {
    // Условие usedAt: null в WHERE делает операцию атомарной: при гонке
    // обновится только одна строка, и второй вызов получит count = 0.
    const result = await this.prisma.db.userInvite.updateMany({
      where: { id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return result.count === 1;
  }

  async attachConsumer(id: string, usedBy: string): Promise<void> {
    await this.prisma.db.userInvite.update({ where: { id }, data: { usedBy } });
  }

  async listPending(email?: string): Promise<InviteRecord[]> {
    return this.prisma.db.userInvite.findMany({
      where: {
        ...(email ? { email } : {}),
        usedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
      select: INVITE_SELECT,
    });
  }
}
