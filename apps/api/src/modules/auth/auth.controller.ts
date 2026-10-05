import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthSession } from '@octagon/contracts';
import type { Request } from 'express';

import { AuthService } from './auth.service';
import { LoginDto, LogoutDto, RefreshDto } from './auth.dto';

/**
 * Аутентификация (docs/09-api.md, docs/23-api-contract-plan.md).
 *
 * Rate limiting реализован внутри AuthService: лимиты считаются по IP и по
 * email отдельно и требуют Redis (docs/15-security.md).
 */
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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
  refresh(@Body() dto: RefreshDto): Promise<AuthSession> {
    return this.auth.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Выход: отзыв refresh-токена' })
  logout(@Body() dto: LogoutDto): Promise<void> {
    return this.auth.logout(dto.refreshToken);
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
