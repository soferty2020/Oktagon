import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { TokenService } from '../modules/auth/token.service';
import { AccessTokenVerifier } from './access-token.verifier';
import { AuthGuard } from './auth-stub';
import { RequestContextService } from './request-context.service';

/**
 * Проверка access-токенов для защищенных маршрутов.
 *
 * Глобальный модуль: guard нужен всем доменным модулям, а зависимость от
 * модуля auth создала бы цикл (auth -> identity -> auth).
 *
 * `RequestContextService` объявлен здесь же, потому что им пользуются и guard
 * (проставляет автора изменения), и audit (читает контекст запроса).
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [TokenService, AccessTokenVerifier, AuthGuard, RequestContextService],
  // Глобальный модуль открывает наружу только перечисленное здесь:
  // TokenService нужен AuthService, JwtModule — RefreshTokenSigner из auth.
  exports: [JwtModule, TokenService, AccessTokenVerifier, AuthGuard, RequestContextService],
})
export class TokenModule {}
