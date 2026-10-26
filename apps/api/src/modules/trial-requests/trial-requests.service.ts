import { Injectable, Logger } from '@nestjs/common';
import {
  ApiErrorCode,
  isFinalTrialStatus,
  type CreateTrialRequestInput,
  type TrialRequestStatus,
  type TrialRequestView,
} from '@octagon/contracts';

import { ApiException } from '../../shared/api-exception';
import { RateLimiterService } from '../auth/rate-limiter.service';
import {
  TrialRequestsRepository,
  toTrialRequestView,
} from './trial-requests.repository';

/**
 * Заявки на пробную тренировку (ADR-0013).
 *
 * Публичная форма — единственный пишущий эндпоинт без токена, поэтому здесь
 * honeypot и лимит по IP, а не в контроллере: правило относится к бизнес-смыслу
 * («заявка от человека»), а не к разбору HTTP.
 */
@Injectable()
export class TrialRequestsService {
  private readonly logger = new Logger(TrialRequestsService.name);

  /** Лимит на IP: 5 заявок в час. Больше — уже не человек, а скрипт. */
  private static readonly RATE_MAX = 5;
  private static readonly RATE_WINDOW_SECONDS = 3600;

  constructor(
    private readonly repository: TrialRequestsRepository,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  async list(status?: TrialRequestStatus): Promise<TrialRequestView[]> {
    return (await this.repository.list(status)).map(toTrialRequestView);
  }

  /**
   * Публичная заявка.
   *
   * Если honeypot заполнен, возвращаем «успех» и ничего не создаём: бот не должен
   * понять, что его отсеяли, иначе начнёт перебирать поля.
   */
  async submit(input: CreateTrialRequestInput, ip: string | null): Promise<TrialRequestView | null> {
    if (input.website && input.website.trim().length > 0) {
      this.logger.warn(`Заявка отклонена honeypot (ip ${ip ?? 'unknown'})`);
      return null;
    }

    if (ip) {
      const limit = await this.rateLimiter.consume(
        `trial:ip:${ip}`,
        TrialRequestsService.RATE_MAX,
        TrialRequestsService.RATE_WINDOW_SECONDS,
      );

      if (!limit.allowed) {
        throw new ApiException(
          'RATE_LIMITED' satisfies ApiErrorCode,
          'Слишком много заявок. Попробуйте через час или позвоните в клуб',
        );
      }
    }

    const record = await this.repository.create({
      name: input.name.trim(),
      phone: input.phone.trim(),
      email: input.email?.trim() || null,
      childName: input.childName?.trim() || null,
      childAge: input.childAge ?? null,
      comment: input.comment?.trim() || null,
      source: input.source?.trim() || null,
    });

    this.logger.log(`Заявка ${record.id}: создана`);
    return toTrialRequestView(record);
  }

  /** Смена статуса: из финального не возвращаемся — иначе врёт конверсия. */
  async updateStatus(
    callerId: string,
    id: string,
    status: TrialRequestStatus,
  ): Promise<TrialRequestView> {
    const existing = await this.repository.findById(id);
    if (!existing) {
      throw ApiException.notFound('Заявка не найдена');
    }

    if (isFinalTrialStatus(existing.status) && existing.status !== status) {
      throw new ApiException(
        'VALIDATION_FAILED' satisfies ApiErrorCode,
        `Заявка уже в финальном статусе «${existing.status}» и не возвращается в работу`,
      );
    }

    const record = await this.repository.updateStatus(id, status, callerId);
    return toTrialRequestView(record);
  }
}
