import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiErrorCode,
  AuditAction,
  AuditEntityType,
  type ClubProfileView,
  type UpdateClubProfileInput,
} from '@octagon/contracts';

import { ApiException } from '../../shared/api-exception';
import { AuditService } from '../audit/audit.service';
import { SettingsRepository, type ClubProfileRecord } from './settings.repository';

/** Пределы полей: совпадают с ограничениями колонок в БД. */
const MAX_NAME = 200;
const MAX_LOGO_URL = 500;
const MAX_PHONE = 32;
const MAX_EMAIL = 200;
const MAX_ADDRESS = 500;
const MAX_TIMEZONE = 64;

/**
 * Настройки клуба (K1, docs/26-admin-settings.md).
 *
 * Здесь только безопасные параметры: название, логотип, контакты и часовой пояс.
 * Секреты и инфраструктура в этот сервис не попадают: документ запрещает выносить
 * их в админку и сериализовать в API.
 *
 * Доступ проверяется SuperadminGuard на контроллере — не правами: даже сотрудник
 * с индивидуальным grant'ом не должен менять профиль клуба.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly repository: SettingsRepository,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Профиль клуба.
   *
   * Если строки еще нет, возвращается профиль по умолчанию без записи в БД:
   * чтение не должно создавать данные. Запись появится при первом сохранении.
   */
  async getClubProfile(): Promise<ClubProfileView> {
    const record = await this.repository.findClubProfile();
    return record ? toView(record) : this.defaultProfile();
  }

  /**
   * Изменение профиля.
   *
   * Поля необязательны: форма отправляет только измененное. Каждое значение
   * проверяется до записи, потому что опечатка в часовом поясе или почте
   * проявится не сразу, а при расчете расписания и отправке писем.
   */
  async updateClubProfile(
    callerUserId: string,
    input: UpdateClubProfileInput,
  ): Promise<ClubProfileView> {
    const current = await this.getClubProfile();

    const next: ClubProfileView = {
      name: input.name === undefined ? current.name : validateName(input.name),
      logoUrl: input.logoUrl === undefined ? current.logoUrl : validateLogoUrl(input.logoUrl),
      phone: input.phone === undefined ? current.phone : validateText(input.phone, MAX_PHONE, 'Телефон'),
      email: input.email === undefined ? current.email : validateEmail(input.email),
      address:
        input.address === undefined ? current.address : validateText(input.address, MAX_ADDRESS, 'Адрес'),
      timezone:
        input.timezone === undefined ? current.timezone : validateTimezone(input.timezone),
      updatedAt: current.updatedAt,
    };

    const saved = await this.repository.saveClubProfile({
      name: next.name,
      logoUrl: next.logoUrl,
      phone: next.phone,
      email: next.email,
      address: next.address,
      timezone: next.timezone,
    });

    // Аудит пишется и при отсутствии изменений: запись «кто открыл и сохранил»
    // полезна, когда разбираются, почему настройка не применилась.
    await this.audit.recordSafely({
      action: AuditAction.SETTINGS_CLUB_UPDATED,
      entityType: AuditEntityType.CLUB_PROFILE,
      entityId: 'default',
      actorUserId: callerUserId,
      before: current,
      after: toView(saved),
    });

    this.logger.log(`Профиль клуба обновлен пользователем ${callerUserId}`);
    return toView(saved);
  }

  /** Профиль по умолчанию: значения из окружения, чтобы не хардкодить клуб. */
  private defaultProfile(): ClubProfileView {
    return {
      name: this.config.get<string>('CLUB_NAME') ?? 'Карате-клуб OCTAGON',
      logoUrl: null,
      phone: null,
      email: null,
      address: null,
      timezone: this.config.get<string>('CLUB_TIMEZONE') ?? 'Asia/Almaty',
      updatedAt: new Date(0).toISOString(),
    };
  }
}

function toView(record: ClubProfileRecord): ClubProfileView {
  return {
    name: record.name,
    logoUrl: record.logoUrl,
    phone: record.phone,
    email: record.email,
    address: record.address,
    timezone: record.timezone,
    updatedAt: record.updatedAt.toISOString(),
  };
}

function validateName(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ApiException('VALIDATION_FAILED' satisfies ApiErrorCode, 'Название клуба не может быть пустым');
  }
  if (trimmed.length > MAX_NAME) {
    throw new ApiException(
      'VALIDATION_FAILED' satisfies ApiErrorCode,
      `Название клуба длиннее ${MAX_NAME} символов`,
    );
  }
  return trimmed;
}

function validateLogoUrl(value: string | null): string | null {
  if (value === null || value.trim() === '') {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length > MAX_LOGO_URL) {
    throw new ApiException(
      'VALIDATION_FAILED' satisfies ApiErrorCode,
      `Ссылка на логотип длиннее ${MAX_LOGO_URL} символов`,
    );
  }

  // Загрузки файлов в MVP нет, поэтому логотип — абсолютный http(s)-адрес.
  // Относительный путь сломался бы при смене домена админки.
  if (!/^https?:\/\/\S+$/i.test(trimmed)) {
    throw new ApiException(
      'VALIDATION_FAILED' satisfies ApiErrorCode,
      'Логотип должен быть ссылкой http:// или https://',
    );
  }
  return trimmed;
}

function validateText(value: string | null, maxLength: number, field: string): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > maxLength) {
    throw new ApiException(
      'VALIDATION_FAILED' satisfies ApiErrorCode,
      `${field}: больше ${maxLength} символов`,
    );
  }
  return trimmed;
}

function validateEmail(value: string | null): string | null {
  const trimmed = validateText(value, MAX_EMAIL, 'Email');
  if (trimmed === null) {
    return null;
  }

  // Достаточно грубая проверка: точную валидность адреса решает почтовый сервер,
  // а строгая регулярка отвергала бы рабочие адреса.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    throw new ApiException('VALIDATION_FAILED' satisfies ApiErrorCode, 'Некорректный email клуба');
  }
  return trimmed;
}

/**
 * Часовой пояс: IANA-имя, а не смещение.
 *
 * `Intl.DateTimeFormat` принимает и смещения (`+05:00`), поэтому одной проверки
 * форматом недостаточно: смещение не выражает переход на летнее время, и
 * расписание поехало бы. Список зон берётся у самого ICU через
 * `supportedValuesOf` — копия списка в коде устаревала бы с обновлениями Node.
 */
function validateTimezone(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_TIMEZONE) {
    throw new ApiException('VALIDATION_FAILED' satisfies ApiErrorCode, 'Некорректный часовой пояс');
  }

  // Метод появился в ES2022; на старом рантайме остается проверка форматом.
  const supported =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : null;

  if (supported) {
    if (!supported.includes(trimmed)) {
      throw new ApiException(
        'VALIDATION_FAILED' satisfies ApiErrorCode,
        `Неизвестный часовой пояс: ${trimmed}. Нужно IANA-имя, например Asia/Almaty`,
      );
    }
    return trimmed;
  }

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: trimmed }).format(new Date());
  } catch {
    throw new ApiException(
      'VALIDATION_FAILED' satisfies ApiErrorCode,
      `Неизвестный часовой пояс: ${trimmed}. Нужно IANA-имя, например Asia/Almaty`,
    );
  }

  return trimmed;
}
