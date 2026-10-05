import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';

/**
 * Параметры Argon2id по ADR-0004: рекомендация OWASP для 2 vCPU / 4 GB RAM
 * (docs/14-infrastructure.md).
 */
export const ARGON2_OPTIONS = {
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

/** Префикс PHC-формата Argon2id. Позволяет отличить алгоритм при миграции. */
export const ARGON2ID_PREFIX = '$argon2id$';

/**
 * Хеширование и проверка паролей (ADR-0004).
 *
 * Версия и параметры хранятся внутри строки хеша, поэтому ужесточение
 * параметров не требует миграции данных: старые хеши продолжают проверяться.
 */
@Injectable()
export class PasswordService {
  /** Возвращает PHC-строку вида `$argon2id$v=19$m=19456,t=2,p=1$<salt>$<hash>`. */
  hash(plainPassword: string): Promise<string> {
    return hash(plainPassword, ARGON2_OPTIONS);
  }

  /**
   * Проверяет пароль против сохраненного хеша.
   *
   * Неизвестный или поврежденный формат хеша считается несовпадением, а не
   * ошибкой сервера: пользователь должен получить 401, а не 500.
   */
  async verify(plainPassword: string, passwordHash: string | null): Promise<boolean> {
    if (!passwordHash?.startsWith(ARGON2ID_PREFIX)) {
      return false;
    }

    try {
      return await verify(passwordHash, plainPassword);
    } catch {
      return false;
    }
  }
}
