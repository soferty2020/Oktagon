import { Injectable } from '@nestjs/common';
import type { ParticipantAdmission, ParticipantPaymentStatus, ParticipantResult } from '@octagon/contracts';

import { PrismaService } from '../../prisma/prisma.service';

export interface ParticipantRecord {
  id: string;
  eventId: string;
  athleteId: string;
  responsibleTrainerId: string | null;
  targetRank: string;
  snapshotRank: string | null;
  admission: ParticipantAdmission;
  paymentStatus: ParticipantPaymentStatus;
  result: ParticipantResult;
  awardedRank: string | null;
  resultComment: string | null;
  certificationId: string | null;
  createdAt: Date;
  updatedAt: Date;
  athlete: { id: string; firstName: string; lastName: string };
  responsibleTrainer: { id: string; displayName: string } | null;
}

const PARTICIPANT_SELECT = {
  id: true,
  eventId: true,
  athleteId: true,
  responsibleTrainerId: true,
  targetRank: true,
  snapshotRank: true,
  admission: true,
  paymentStatus: true,
  result: true,
  awardedRank: true,
  resultComment: true,
  certificationId: true,
  createdAt: true,
  updatedAt: true,
  athlete: { select: { id: true, firstName: true, lastName: true } },
  responsibleTrainer: { select: { id: true, displayName: true } },
} as const;

@Injectable()
export class ParticipantsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(eventId: string): Promise<ParticipantRecord[]> {
    return this.prisma.db.certificationParticipant.findMany({
      where: { eventId },
      orderBy: [{ athlete: { lastName: 'asc' } }, { athlete: { firstName: 'asc' } }],
      select: PARTICIPANT_SELECT,
    });
  }

  async find(eventId: string, athleteId: string): Promise<ParticipantRecord | null> {
    return this.prisma.db.certificationParticipant.findUnique({
      where: { eventId_athleteId: { eventId, athleteId } },
      select: PARTICIPANT_SELECT,
    });
  }

  async findById(id: string): Promise<ParticipantRecord | null> {
    return this.prisma.db.certificationParticipant.findUnique({
      where: { id },
      select: PARTICIPANT_SELECT,
    });
  }

  async create(input: {
    eventId: string;
    athleteId: string;
    targetRank: string;
    snapshotRank: string;
    responsibleTrainerId: string | null;
  }): Promise<ParticipantRecord> {
    return this.prisma.db.certificationParticipant.create({
      data: input,
      select: PARTICIPANT_SELECT,
    });
  }

  async update(
    id: string,
    patch: {
      targetRank?: string;
      admission?: ParticipantAdmission;
      paymentStatus?: ParticipantPaymentStatus;
      result?: ParticipantResult;
      awardedRank?: string | null;
      resultComment?: string | null;
      certificationId?: string | null;
    },
  ): Promise<ParticipantRecord> {
    return this.prisma.db.certificationParticipant.update({
      where: { id },
      data: patch,
      select: PARTICIPANT_SELECT,
    });
  }

  async remove(id: string): Promise<void> {
    await this.prisma.db.certificationParticipant.delete({ where: { id } });
  }

  /** Статус мероприятия: до публикации результаты скрываются от родителей. */
  async eventStatus(eventId: string): Promise<string | null> {
    const event = await this.prisma.db.certificationEvent.findUnique({
      where: { id: eventId },
      select: { status: true },
    });

    return event?.status ?? null;
  }

  /** Версии результата участника: новые сверху. */
  async revisions(participantId: string) {
    return this.prisma.db.certificationResultRevision.findMany({
      where: { participantId },
      orderBy: { version: 'desc' },
      select: {
        id: true,
        version: true,
        result: true,
        awardedRank: true,
        comment: true,
        reason: true,
        changedAt: true,
        changedBy: { select: { id: true, email: true } },
      },
    });
  }

  /**
   * Был ли пользователь ответственным за результат этого спортсмена.
   *
   * Отдельная проверка нужна при переводе в другую группу: зона доступа
   * меняется, а право исправлять исторический результат — нет.
   */
  async isResponsibleTrainer(userId: string, athleteId: string): Promise<boolean> {
    const profile = await this.prisma.db.trainerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!profile) {
      return false;
    }

    const record = await this.prisma.db.certificationParticipant.findFirst({
      where: { athleteId, responsibleTrainerId: profile.id },
      select: { id: true },
    });

    return record !== null;
  }
  /** Текущая ступень спортсмена: снимок при добавлении в мероприятие. */
  async currentRank(athleteId: string): Promise<string> {
    const athlete = await this.prisma.db.athlete.findUnique({
      where: { id: athleteId },
      select: { rank: true },
    });

    return athlete?.rank ?? 'kyu-0';
  }
}

/**
 * Запись результата в транзакции (#35).
 *
 * Три вещи должны измениться вместе: версия результата, сам участник и текущая
 * ступень спортсмена. Если разнести их по отдельным запросам, при сбое между ними
 * получится «сдал, но ступень не присвоена» — именно такие расхождения потом
 * ищут вручную.
 *
 * `existingCertificationId` — результат уже присваивал ступень: тогда запись не
 * создаётся заново, а исправляется. Иначе повторное сохранение PASSED плодило бы
 * дубли аттестаций.
 */
export interface RecordResultTransactionInput {
  participantId: string;
  athleteId: string;
  result: ParticipantResult;
  awardedRank: string | null;
  awardedBelt: string | null;
  certifiedOn: Date;
  comment: string | null;
  reason: string | null;
  changedById: string;
  existingCertificationId: string | null;
}

export interface RecordResultTransactionOutput {
  participant: ParticipantRecord;
  certificationId: string | null;
  version: number;
}

@Injectable()
export class ResultsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: RecordResultTransactionInput): Promise<RecordResultTransactionOutput> {
    return this.prisma.db.$transaction(async (tx) => {
      const lastRevision = await tx.certificationResultRevision.findFirst({
        where: { participantId: input.participantId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });

      const version = (lastRevision?.version ?? 0) + 1;

      await tx.certificationResultRevision.create({
        data: {
          participantId: input.participantId,
          version,
          result: input.result,
          awardedRank: input.awardedRank,
          comment: input.comment,
          changedById: input.changedById,
          reason: input.reason,
        },
      });

      let certificationId: string | null = input.existingCertificationId;

      if (input.result === 'PASSED' && input.awardedRank) {
        if (certificationId) {
          await tx.certification.update({
            where: { id: certificationId },
            data: {
              rank: input.awardedRank,
              beltGrade: input.awardedBelt as never,
              certifiedOn: input.certifiedOn,
              // stageKind/stageNumber остаются для старых клиентов.
              stageKind: input.awardedRank.startsWith('dan') ? 'DAN' : 'KYU',
              stageNumber: Number(input.awardedRank.split('-')[1]),
              note: input.comment,
            },
          });
        } else {
          const created = await tx.certification.create({
            data: {
              athleteId: input.athleteId,
              certifiedOn: input.certifiedOn,
              beltGrade: input.awardedBelt as never,
              stageKind: input.awardedRank.startsWith('dan') ? 'DAN' : 'KYU',
              stageNumber: Number(input.awardedRank.split('-')[1]),
              rank: input.awardedRank,
              note: input.comment,
              createdById: input.changedById,
            },
            select: { id: true },
          });

          certificationId = created.id;
        }

        await tx.athlete.update({
          where: { id: input.athleteId },
          data: {
            rank: input.awardedRank,
            beltGrade: input.awardedBelt as never,
            beltAwardedAt: input.certifiedOn,
          },
        });
      }

      // Не сдал или не пришёл: прежнее присвоение (если было) отменяется, ступень
      // пересчитывается по последней оставшейся аттестации.
      if (input.result !== 'PASSED' && certificationId) {
        await tx.certification.delete({ where: { id: certificationId } });
        certificationId = null;

        const latest = await tx.certification.findFirst({
          where: { athleteId: input.athleteId },
          orderBy: [{ certifiedOn: 'desc' }, { createdAt: 'desc' }],
          select: { rank: true, beltGrade: true },
        });

        await tx.athlete.update({
          where: { id: input.athleteId },
          data: {
            rank: latest?.rank ?? 'kyu-0',
            beltGrade: latest?.beltGrade ?? 'WHITE',
            beltAwardedAt: null,
          },
        });
      }

      const participant = await tx.certificationParticipant.update({
        where: { id: input.participantId },
        data: {
          result: input.result,
          awardedRank: input.result === 'PASSED' ? input.awardedRank : null,
          resultComment: input.comment,
          certificationId,
        },
        select: PARTICIPANT_SELECT,
      });

      return { participant, certificationId, version };
    });
  }
}