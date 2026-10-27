import { createHash, randomBytes } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiErrorCode,
  AuditAction,
  AuditEntityType,
  type UserInviteCreated,
  type UserInvitePreview,
  type UserInviteView,
  type UserRole,
} from '@octagon/contracts';

import type { AppEnvironment } from '@octagon/config';
import { ApiException } from '../../shared/api-exception';
import { AuditService } from '../audit/audit.service';
import { AuthRepository } from './auth.repository';
import { InviteRepository, type InviteRecord } from './invite.repository';
import { PasswordService } from './password.service';

/** Длина токена приглашения в байтах (hex-представление вдвое длиннее). */
const TOKEN_BYTES = 32;

/** Длина кода приглашения: тренер вводит его в приложении вручную. */
const CODE_LENGTH = 8;

/**
 * Алфавит кода без похожих символов: `0/O`, `1/I/L` не отличить на телефоне, а
 * код диктуют голосом или переписывают из мессенджера.
 */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** Генерирует код приглашения. */
export function generateInviteCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let code = '';

  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += CODE_ALPHABET[bytes[index] % CODE_ALPHABET.length];
  }

  return code;
}

/**
 * Хеш кода. Ввод нормализуется: пробелы, дефисы и регистр не должны решать,
 * сработает код или нет — человек вводит его с телефона.
 */
export function hashInviteCode(code: string): string {
  const normalized = code.replace(/[\s-]/g, '').toUpperCase();
  return createHash('sha256').update(normalized).digest('hex');
}

/** Считает хеш токена для хранения: сам токен в БД не попадает. */
export function hashInviteToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface CreateInviteInput {
  email: string;
  role: UserRole;
  /** Администратор, создавший приглашение. */
  createdBy: string;
}

export interface AcceptInviteInput {
  token?: string;
  /** Идентификатор приглашения, если администратор передал его напрямую. */
  inviteId?: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  phone?: string;
}

/** Принятие по короткому коду (ADR-0014). */
export interface AcceptInviteCodeInput {
  code: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  middleName?: string;
  phone?: string;
}

/**
 * Приглашения пользователей (MVP scope: саморегистрации нет,
 * docs/04-roles-permissions.md).
 *
 * Токен показывается один раз при создании: в БД хранится только его
 * SHA-256-хеш. Провайдер доставки письма не выбран
 * (docs/25-open-questions.md), поэтому передача токена — задача вызывающей
 * стороны (админка, ручная отправка).
 */
@Injectable()
export class InviteService {
  private readonly logger = new Logger(InviteService.name);

  constructor(
    private readonly invites: InviteRepository,
    private readonly users: AuthRepository,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<AppEnvironment, true>,
  ) {}

  /** Создает приглашение. Перевыпуск гасит предыдущие неиспользованные. */
  async create(input: CreateInviteInput): Promise<UserInviteCreated> {
    const email = input.email.trim().toLowerCase();

    const existing = await this.users.findUserForAuth(email);
    if (existing && existing.status !== 'INVITED') {
      throw new ApiException(
        'EMAIL_ALREADY_EXISTS' satisfies ApiErrorCode,
        'Пользователь с таким email уже существует',
      );
    }

    const revoked = await this.invites.revokePendingForEmail(email);
    if (revoked > 0) {
      this.logger.log(`Перевыпуск приглашения: погашено предыдущих — ${revoked}`);
    }

    const token = randomBytes(TOKEN_BYTES).toString('hex');
    // Код нужен тренеру в зале: ссылку открывать в браузере неудобно, а код
    // вводится прямо в приложении.
    const code = generateInviteCode();
    const expiresAt = new Date(Date.now() + this.inviteTtlHours() * 3600 * 1000);

    const record = await this.invites.create({
      email,
      role: input.role,
      tokenHash: hashInviteToken(token),
      codeHash: hashInviteCode(code),
      expiresAt,
      createdBy: input.createdBy,
    });

    await this.audit.recordSafely({
      action: AuditAction.USER_INVITED,
      entityType: AuditEntityType.USER_INVITE,
      entityId: record.id,
      after: { email, role: input.role, expiresAt: expiresAt.toISOString() },
    });

    return { ...toView(record), token, code };
  }

  /** Список действующих приглашений для админки. */
  async listPending(email?: string): Promise<UserInviteView[]> {
    const records = await this.invites.listPending(email?.trim().toLowerCase());
    return records.map(toView);
  }

  /**
   * Что видно по токену приглашения до его принятия.
   *
   * Отдается без сессии: ссылку открывает приглашенный, у которого аккаунта еще
   * нет. Поэтому в ответе только адрес, роль и срок — ничего о клубе и его
   * пользователях. Недействительное, истекшее или уже использованное приглашение
   * неотличимы друг от друга (`INVITE_INVALID`): по ответу нельзя перебором
   * выяснить, какие приглашения существуют.
   */
  async preview(token: string): Promise<UserInvitePreview> {
    const invite = await this.invites.findByTokenHash(hashInviteToken(token));

    if (!invite || invite.usedAt || invite.expiresAt.getTime() <= Date.now()) {
      throw new ApiException(
        'INVITE_INVALID' satisfies ApiErrorCode,
        'Приглашение недействительно: запросите новое у администратора',
      );
    }

    return {
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
    };
  }

  /**
   * Принятие приглашения: пользователь задает пароль.
   *
   * Проверки: токен существует (или приглашение найдено по id), не истек, не
   * использован, email совпадает. Пароль хешируется Argon2id (ADR-0004), роль
   * берется из приглашения.
   *
   * Гашение приглашения выполняется атомарно (consume): при одновременных
   * запросах успеет только один, второй получит INVITE_ALREADY_USED.
   */
  async accept(
    input: AcceptInviteInput,
  ): Promise<{ userId: string; email: string; role: UserRole }> {
    const invite = await this.resolveInvite(input);
    const email = input.email.trim().toLowerCase();

    if (invite.expiresAt.getTime() <= Date.now()) {
      throw new ApiException('INVITE_EXPIRED' satisfies ApiErrorCode, 'Срок приглашения истек');
    }
    if (invite.email !== email) {
      // Иначе пользователь мог бы принять чужое приглашение под своим адресом.
      throw new ApiException(
        'INVITE_EMAIL_MISMATCH' satisfies ApiErrorCode,
        'Приглашение выдано на другой email',
      );
    }

    const consumed = await this.invites.consume(invite.id);
    if (!consumed) {
      throw new ApiException(
        'INVITE_ALREADY_USED' satisfies ApiErrorCode,
        'Приглашение уже использовано',
      );
    }

    const passwordHash = await this.passwords.hash(input.password);
    const user = await this.users.activateFromInvite({
      email,
      passwordHash,
      role: invite.role,
      firstName: input.firstName,
      lastName: input.lastName,
      middleName: input.middleName,
      phone: input.phone,
    });

    await this.invites.attachConsumer(invite.id, user.id);

    await this.audit.recordSafely({
      action: AuditAction.AUTH_INVITE_ACCEPTED,
      entityType: AuditEntityType.USER_INVITE,
      entityId: invite.id,
      after: { userId: user.id, email, role: invite.role },
    });

    return { userId: user.id, email: user.email, role: invite.role };
  }

  /**
   * Принятие приглашения по коду (ADR-0014).
   *
   * Код — то же приглашение, только другой способ его предъявить: тот же срок,
   * та же одноразовость, та же проверка email. Поэтому дальше вызывается общий
   * `accept` — правила не должны разъезжаться между ссылкой и кодом.
   */
  async acceptByCode(
    input: AcceptInviteCodeInput,
  ): Promise<{ userId: string; email: string; role: UserRole }> {
    const invite = await this.invites.findByCodeHash(hashInviteCode(input.code));

    // Недействительный, истекший и использованный код неотличимы: иначе
    // перебором можно выяснить, какие приглашения существуют.
    if (!invite) {
      throw new ApiException(
        'INVITE_INVALID' satisfies ApiErrorCode,
        'Код недействителен: проверьте символы или запросите новый у администратора',
      );
    }

    return this.accept({
      inviteId: invite.id,
      email: input.email,
      password: input.password,
      firstName: input.firstName,
      lastName: input.lastName,
      middleName: input.middleName,
      phone: input.phone,
    });
  }

  private async resolveInvite(input: AcceptInviteInput): Promise<InviteRecord> {    if (input.token) {
      const byToken = await this.invites.findByTokenHash(hashInviteToken(input.token));
      if (!byToken) {
        throw new ApiException('INVITE_INVALID' satisfies ApiErrorCode, 'Приглашение не найдено');
      }
      return byToken;
    }

    if (input.inviteId) {
      const byId = await this.invites.findById(input.inviteId);
      if (!byId) {
        throw new ApiException('INVITE_INVALID' satisfies ApiErrorCode, 'Приглашение не найдено');
      }
      return byId;
    }

    throw new ApiException(
      'INVITE_INVALID' satisfies ApiErrorCode,
      'Укажите token или inviteId приглашения',
    );
  }

  private inviteTtlHours(): number {
    return Number(this.config.get('INVITE_TTL_HOURS', { infer: true }) ?? 72);
  }
}

/** Преобразует запись приглашения в контракт для админки. */
function toView(record: InviteRecord): UserInviteView {
  return {
    id: record.id,
    email: record.email,
    role: record.role,
    expiresAt: record.expiresAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
  };
}
