import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthSession, UserInvitePreview } from '@octagon/contracts';
import type { Request } from 'express';

import { AuthService } from './auth.service';
import { LoginDto, LogoutDto, RefreshDto, RegisterDto } from './auth.dto';
import { AcceptInviteCodeDto, AcceptInviteDto } from './invite.dto';
import { InviteService } from './invite.service';

/**
 * Аутентификация (docs/09-api.md, docs/23-api-contract-plan.md).
 *
 * Rate limiting реализован внутри AuthService: лимиты считаются по IP и по
 * email отдельно и требуют Redis (docs/15-security.md).
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly invites: InviteService,
  ) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Самостоятельная регистрация родителя (ADR-0015)' })
  @ApiCreatedResponse({ description: 'Аккаунт создан, выданы токены; детей пока нет' })
  register(@Body() dto: RegisterDto, @Req() request: Request): Promise<AuthSession> {
    return this.auth.register({
      email: dto.email,
      password: dto.password,
      firstName: dto.firstName,
      lastName: dto.lastName,
      phone: dto.phone,
      ip: clientIp(request),
    });
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Вход по email и паролю' })
  @ApiOkResponse({ description: 'Access- и refresh-токены, профиль пользователя' })
  login(@Body() dto: LoginDto, @Req() request: Request): Promise<AuthSession> {
    return this.auth.login({
      email: dto.email,
      password: dto.password,
      ip: clientIp(request),
    });
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Обновление сессии с ротацией refresh-токена' })
  @ApiOkResponse({ description: 'Новая пара токенов и профиль пользователя' })
  refresh(@Body() dto: RefreshDto, @Req() request: Request): Promise<AuthSession> {
    // IP передается для ограничения перебора refresh-токенов: сам токен —
    // секрет, и попытки его подбора нужно считать (docs/15-security.md).
    return this.auth.refresh(dto.refreshToken, clientIp(request));
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Выход: отзыв refresh-токена' })
  logout(@Body() dto: LogoutDto): Promise<void> {
    return this.auth.logout(dto.refreshToken);
  }

  @Post('accept-invite')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Принятие приглашения: установка пароля и профиля' })
  @ApiOkResponse({ description: 'Пользователь активирован; далее выполняется вход' })
  async acceptInvite(
    @Body() dto: AcceptInviteDto,
    @Req() request: Request,
  ): Promise<{ userId: string; email: string; role: string }> {
    // Токен — секрет, поэтому попытки его подбора ограничиваются по IP.
    await this.auth.enforceInviteRateLimit(clientIp(request));
    return this.invites.accept({
      token: dto.token,
      inviteId: dto.inviteId,
      email: dto.email,
      password: dto.password,
      firstName: dto.firstName,
      lastName: dto.lastName,
      middleName: dto.middleName,
      phone: dto.phone,
    });
  }

  /**
   * Принятие приглашения по короткому коду (ADR-0014).
   *
   * Нужен тренеру, который ставит приложение и не открывает ссылки из браузера.
   * Код короткий, поэтому лимит по IP здесь особенно важен: 8 символов можно
   * перебирать, если не ограничивать попытки.
   */
  @Post('accept-invite-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Принятие приглашения по коду: установка пароля и профиля' })
  @ApiOkResponse({ description: 'Пользователь активирован; далее выполняется вход' })
  async acceptInviteByCode(
    @Body() dto: AcceptInviteCodeDto,
    @Req() request: Request,
  ): Promise<{ userId: string; email: string; role: string }> {
    await this.auth.enforceInviteRateLimit(clientIp(request));
    return this.invites.acceptByCode({
      code: dto.code,
      email: dto.email,
      password: dto.password,
      firstName: dto.firstName,
      lastName: dto.lastName,
      middleName: dto.middleName,
      phone: dto.phone,
    });
  }

  /**
   * Просмотр приглашения по токену: адрес, роль и срок.
   *
   * Публичный: у приглашенного еще нет аккаунта, и страница принятия должна
   * показать, на какой адрес выдано приглашение. Токен — секрет, поэтому попытки
   * подбора ограничиваются по IP так же, как при принятии.
   */
  @Get('invites/:token')
  @ApiOperation({ summary: 'Просмотр приглашения по токену' })
  @ApiOkResponse({ description: 'Адрес, роль и срок действия приглашения' })
  async previewInvite(
    @Param('token') token: string,
    @Req() request: Request,
  ): Promise<UserInvitePreview> {
    await this.auth.enforceInviteRateLimit(clientIp(request));
    return this.invites.preview(token);
  }
}

function clientIp(request: Request): string | null {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim() !== '') {
    const [first] = forwarded.split(',');
    if (first) {
      return first.trim();
    }
  }
  return request.ip ?? request.socket?.remoteAddress ?? null;
}
