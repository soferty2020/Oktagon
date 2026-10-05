import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { TokenService } from '../modules/auth/token.service';
import { AccessTokenVerifier } from './access-token.verifier';
import { AuthGuard } from './auth-stub';

/**
 * Проверка access-токенов для защищенных маршрутов.
 *
 * Глобальный модуль: guard нужен всем доменным модулям, а зависимость от
 * модуля auth создала бы цикл (auth -> identity -> auth).
 */
@Global()
@Module({
  imports: [JwtModule.register({})],
  providers: [TokenService, AccessTokenVerifier, AuthGuard],
  // Глобальный модуль открывает наружу только перечисленное здесь:
  // TokenService нужен AuthService, JwtModule — RefreshTokenSigner из auth.
  exports: [JwtModule, TokenService, AccessTokenVerifier, AuthGuard],
})
export class TokenModule {}
