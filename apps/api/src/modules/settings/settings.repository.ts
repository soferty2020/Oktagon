import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

/** Профиль клуба в том виде, в каком он хранится. */
export interface ClubProfileRecord {
  name: string;
  logoUrl: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  timezone: string;
  updatedAt: Date;
}

export interface SaveClubProfileInput {
  name: string;
  logoUrl: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  timezone: string;
}

/**
 * Доступ к настройкам клуба.
 *
 * Абстрактный класс как DI-токен: сервис не зависит от Prisma и тестируется без
 * БД (docs/13-architecture.md).
 */
export abstract class SettingsRepository {
  abstract findClubProfile(): Promise<ClubProfileRecord | null>;
  abstract saveClubProfile(input: SaveClubProfileInput): Promise<ClubProfileRecord>;
}

/** Идентификатор единственной строки профиля. */
const SINGLETON_ID = 'default';

const PROFILE_SELECT = {
  name: true,
  logoUrl: true,
  phone: true,
  email: true,
  address: true,
  timezone: true,
  updatedAt: true,
} as const;

@Injectable()
export class PrismaSettingsRepository extends SettingsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findClubProfile(): Promise<ClubProfileRecord | null> {
    return this.prisma.db.clubProfile.findUnique({
      where: { id: SINGLETON_ID },
      select: PROFILE_SELECT,
    });
  }

  async saveClubProfile(input: SaveClubProfileInput): Promise<ClubProfileRecord> {
    // upsert, а не update: профиль создается при первом сохранении, если его еще
    // нет. Отдельный шаг «создать профиль» администратору не нужен.
    return this.prisma.db.clubProfile.upsert({
      where: { id: SINGLETON_ID },
      create: { id: SINGLETON_ID, ...input },
      update: input,
      select: PROFILE_SELECT,
    });
  }
}
