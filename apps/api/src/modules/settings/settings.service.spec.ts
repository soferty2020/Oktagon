import { ConfigService } from '@nestjs/config';
import { ApiErrorCode, type ClubProfileView } from '@octagon/contracts';

import { ApiException } from '../../shared/api-exception';
import { AuditService } from '../audit/audit.service';
import type { ClubProfileRecord } from './settings.repository';
import { SettingsRepository } from './settings.repository';
import { SettingsService } from './settings.service';

describe('SettingsService', () => {
  let repository: jest.Mocked<SettingsRepository>;
  let audit: { recordSafely: jest.Mock };
  let service: SettingsService;

  const record: ClubProfileRecord = {
    name: 'Карате-клуб OCTAGON',
    logoUrl: null,
    phone: null,
    email: null,
    address: null,
    timezone: 'Asia/Almaty',
    updatedAt: new Date('2026-10-23T10:00:00.000Z'),
  };

  beforeEach(() => {
    repository = {
      findClubProfile: jest.fn().mockResolvedValue(record),
      saveClubProfile: jest.fn().mockImplementation(async (input) => ({
        ...input,
        updatedAt: new Date('2026-10-23T11:00:00.000Z'),
      })),
    } as unknown as jest.Mocked<SettingsRepository>;

    audit = { recordSafely: jest.fn().mockResolvedValue(null) };

    // ConfigService с минимальным набором: сервис читает только CLUB_*.
    const config = {
      get: (key: string) =>
        ({ CLUB_NAME: 'Клуб из конфига', CLUB_TIMEZONE: 'Asia/Almaty' })[key],
    } as unknown as ConfigService;

    service = new SettingsService(repository, audit as unknown as AuditService, config);
  });

  describe('чтение профиля', () => {
    it('отдает сохраненный профиль', async () => {
      const profile = await service.getClubProfile();

      expect(profile.name).toBe('Карате-клуб OCTAGON');
      expect(profile.timezone).toBe('Asia/Almaty');
    });

    it('возвращает значения из конфига, если профиля еще нет', async () => {
      // Чтение не должно создавать данные: строка появится при первом сохранении.
      repository.findClubProfile.mockResolvedValue(null);

      const profile = await service.getClubProfile();

      expect(profile.name).toBe('Клуб из конфига');
      expect(profile.timezone).toBe('Asia/Almaty');
      expect(repository.saveClubProfile).not.toHaveBeenCalled();
    });
  });

  describe('изменение профиля', () => {
    it('сохраняет и пишет в аудит старое и новое значение', async () => {
      const updated = await service.updateClubProfile('admin-1', {
        name: 'Новый клуб',
        phone: '+7 700 000 00 00',
      });

      expect(updated.name).toBe('Новый клуб');
      expect(updated.phone).toBe('+7 700 000 00 00');

      expect(audit.recordSafely).toHaveBeenCalledTimes(1);
      const event = audit.recordSafely.mock.calls[0][0];
      expect(event.actorUserId).toBe('admin-1');
      expect(event.before).toMatchObject({ name: 'Карате-клуб OCTAGON' });
      expect(event.after).toMatchObject({ name: 'Новый клуб' });
    });

    it('меняет только переданные поля', async () => {
      const updated = await service.updateClubProfile('admin-1', { phone: '+7 700 111 11 11' });

      expect(updated.name).toBe('Карате-клуб OCTAGON');
      expect(updated.timezone).toBe('Asia/Almaty');
      expect(updated.phone).toBe('+7 700 111 11 11');
    });

    it('null очищает поле', async () => {
      repository.findClubProfile.mockResolvedValue({ ...record, phone: '+7 700 000 00 00' });

      const updated = await service.updateClubProfile('admin-1', { phone: null });

      expect(updated.phone).toBeNull();
    });
  });

  describe('валидация', () => {
    it('отклоняет пустое название', async () => {
      await expect(service.updateClubProfile('admin-1', { name: '   ' })).rejects.toMatchObject({
        code: 'VALIDATION_FAILED' satisfies ApiErrorCode,
      });
      expect(repository.saveClubProfile).not.toHaveBeenCalled();
    });

    it('отклоняет неизвестный часовой пояс', async () => {
      await expect(
        service.updateClubProfile('admin-1', { timezone: 'Mars/Olympus' }),
      ).rejects.toBeInstanceOf(ApiException);
      expect(repository.saveClubProfile).not.toHaveBeenCalled();
    });

    it('отклоняет смещение вместо IANA-имени', async () => {
      // Смещение не выражает переход на летнее время: расписание поедет.
      await expect(
        service.updateClubProfile('admin-1', { timezone: '+05:00' }),
      ).rejects.toBeInstanceOf(ApiException);
    });

    it('принимает валидное IANA-имя', async () => {
      const updated = await service.updateClubProfile('admin-1', { timezone: 'Europe/Moscow' });

      expect(updated.timezone).toBe('Europe/Moscow');
    });

    it('отклоняет некорректный email', async () => {
      await expect(
        service.updateClubProfile('admin-1', { email: 'octagon.local' }),
      ).rejects.toBeInstanceOf(ApiException);
    });

    it('отклоняет логотип относительным путем', async () => {
      await expect(
        service.updateClubProfile('admin-1', { logoUrl: '/logo.png' }),
      ).rejects.toBeInstanceOf(ApiException);
    });

    it('принимает абсолютную ссылку на логотип', async () => {
      const updated = await service.updateClubProfile('admin-1', {
        logoUrl: 'https://cdn.octagon.kz/logo.png',
      });

      expect(updated.logoUrl).toBe('https://cdn.octagon.kz/logo.png');
    });
  });

  it('не отдает секреты в профиле', async () => {
    // В контракте нет полей под пароли и ключи: проверка на случай, если кто-то
    // решит расширить ответ «на будущее».
    const profile: ClubProfileView = await service.getClubProfile();
    const keys = Object.keys(profile);

    expect(keys).not.toContain('jwtAccessSecret');
    expect(keys).not.toContain('databaseUrl');
    expect(keys.sort()).toEqual(
      ['address', 'email', 'logoUrl', 'name', 'phone', 'timezone', 'updatedAt'].sort(),
    );
  });
});
