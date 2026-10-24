import { Injectable } from '@nestjs/common';
import type { CertificationStageKind } from '@octagon/contracts';
import { PrismaService } from '../../prisma/prisma.service';
import type { BeltGrade } from '../../../generated/prisma';

/** Аттестация в том виде, в каком она хранится. */
export interface CertificationRecord {
  id: string;
  athleteId: string;
  certifiedOn: Date;
  beltGrade: BeltGrade;
  stageKind: CertificationStageKind;
  stageNumber: number;
  note: string | null;
  createdAt: Date;
  createdBy: { id: string; email: string } | null;
}

export interface CreateCertificationRecordInput {
  athleteId: string;
  certifiedOn: Date;
  beltGrade: BeltGrade;
  stageKind: CertificationStageKind;
  stageNumber: number;
  note: string | null;
  createdById: string;
}

/**
 * Доступ к аттестациям.
 *
 * Создание и отмена меняют текущий пояс спортсмена, поэтому выполняются
 * транзакцией: аттестация без обновленного пояса (или наоборот) — это
 * рассогласованные данные, которые никто не заметит до первого вопроса родителя.
 */
export abstract class CertificationsRepository {
  abstract listForAthlete(athleteId: string): Promise<CertificationRecord[]>;
  abstract findById(id: string): Promise<CertificationRecord | null>;
  abstract create(input: CreateCertificationRecordInput): Promise<CertificationRecord>;
  /** Удаляет запись и пересчитывает текущий пояс по последней оставшейся. */
  abstract cancel(id: string): Promise<CertificationRecord | null>;
}

const CERTIFICATION_SELECT = {
  id: true,
  athleteId: true,
  certifiedOn: true,
  beltGrade: true,
  stageKind: true,
  stageNumber: true,
  note: true,
  createdAt: true,
  createdBy: { select: { id: true, email: true } },
} as const;

@Injectable()
export class PrismaCertificationsRepository extends CertificationsRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async listForAthlete(athleteId: string): Promise<CertificationRecord[]> {
    const records = await this.prisma.db.certification.findMany({
      where: { athleteId },
      orderBy: [{ certifiedOn: 'desc' }, { createdAt: 'desc' }],
      select: CERTIFICATION_SELECT,
    });

    return records.map(toRecord);
  }

  async findById(id: string): Promise<CertificationRecord | null> {
    const record = await this.prisma.db.certification.findUnique({
      where: { id },
      select: CERTIFICATION_SELECT,
    });

    return record ? toRecord(record) : null;
  }

  async create(input: CreateCertificationRecordInput): Promise<CertificationRecord> {
    const record = await this.prisma.db.$transaction(async (tx) => {
      const created = await tx.certification.create({
        data: input,
        select: CERTIFICATION_SELECT,
      });

      // Текущий пояс — производное от последней аттестации: карточка и история
      // не должны расходиться.
      await tx.athlete.update({
        where: { id: input.athleteId },
        data: { beltGrade: input.beltGrade, beltAwardedAt: input.certifiedOn },
      });

      return created;
    });

    return toRecord(record);
  }

  async cancel(id: string): Promise<CertificationRecord | null> {
    const existing = await this.findById(id);
    if (!existing) {
      return null;
    }

    await this.prisma.db.$transaction(async (tx) => {
      await tx.certification.delete({ where: { id } });

      const latest = await tx.certification.findFirst({
        where: { athleteId: existing.athleteId },
        orderBy: [{ certifiedOn: 'desc' }, { createdAt: 'desc' }],
        select: { beltGrade: true, certifiedOn: true },
      });

      // Аттестаций не осталось — возвращаем белый пояс: он дефолт, а не
      // отсутствие данных.
      await tx.athlete.update({
        where: { id: existing.athleteId },
        data: {
          beltGrade: latest?.beltGrade ?? 'WHITE',
          beltAwardedAt: latest?.certifiedOn ?? null,
        },
      });
    });

    return existing;
  }
}

function toRecord(record: {
  id: string;
  athleteId: string;
  certifiedOn: Date;
  beltGrade: BeltGrade;
  stageKind: CertificationStageKind;
  stageNumber: number;
  note: string | null;
  createdAt: Date;
  createdBy: { id: string; email: string } | null;
}): CertificationRecord {
  return { ...record };
}
