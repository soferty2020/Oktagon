import { ARGON2ID_PREFIX, PasswordService } from './password.service';

/**
 * ADR-0004: Argon2id в PHC-формате, версия и параметры внутри строки хеша.
 */
describe('PasswordService', () => {
  const service = new PasswordService();

  it('хеширует пароль в формате Argon2id', async () => {
    const hash = await service.hash('Correct-Horse-Battery');

    expect(hash.startsWith(ARGON2ID_PREFIX)).toBe(true);
    expect(hash).toContain('m=19456,t=2,p=1');
    expect(hash).not.toContain('Correct-Horse-Battery');
  });

  it('проверяет верный пароль', async () => {
    const hash = await service.hash('Correct-Horse-Battery');

    await expect(service.verify('Correct-Horse-Battery', hash)).resolves.toBe(true);
  });

  it('не принимает неверный пароль', async () => {
    const hash = await service.hash('Correct-Horse-Battery');

    await expect(service.verify('wrong-password', hash)).resolves.toBe(false);
  });

  it('отвергает пустой хеш (приглашение не принято)', async () => {
    await expect(service.verify('any', null)).resolves.toBe(false);
  });

  it('отвергает хеш чужого формата, не падая с ошибкой', async () => {
    // Временный scrypt из ранних версий seed не должен давать 500.
    await expect(
      service.verify('any', 'scrypt$deadbeef$0011223344'),
    ).resolves.toBe(false);
  });

  it('отвергает поврежденный Argon2-хеш, не падая с ошибкой', async () => {
    await expect(service.verify('any', `${ARGON2ID_PREFIX}not-a-valid-hash`)).resolves.toBe(
      false,
    );
  });

  it('выдает разные хеши для одного пароля (соль случайна)', async () => {
    const first = await service.hash('same-password');
    const second = await service.hash('same-password');

    expect(first).not.toBe(second);
  });
});
