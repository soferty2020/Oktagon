# Подпись release-сборки Android

- Issue: #55 (находка M-1), блокер #27
- Обновлено: 2026-11-02

## Зачем

Сейчас `android/app/build.gradle.kts` подписывает release **debug-ключом**, если
нет `android/key.properties`. Такую сборку нельзя публиковать в RuStore и Google
Play, а установившие её не смогут обновиться на релизную — подписи не совпадут.

Как только файл появится, сборка автоматически переключится на release-ключ; при
его отсутствии Gradle печатает предупреждение и собирает по-старому, чтобы
локальная работа и CI не падали.

## Создать ключ (делает владелец клуба, один раз)

```bash
cd apps/mobile/android

keytool -genkeypair -v \
  -keystore octagon-release.jks \
  -alias octagon-release \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -storetype JKS
```

`keytool` спросит пароль хранилища, пароль ключа и данные организации. Пароли
нужно сохранить: без них ключ бесполезен.

**Срок 10000 дней (~27 лет)** — Google Play требует, чтобы ключ пережил срок
публикации приложения.

## Подключить

1. Положить `octagon-release.jks` в `apps/mobile/android/` (папка уже в
   `.gitignore`).
2. Скопировать `key.properties.example` → `key.properties` и заполнить:

```properties
storePassword=...
keyPassword=...
keyAlias=octagon-release
storeFile=octagon-release.jks
```

3. Собрать и проверить подпись:

```bash
flutter build apk --release --dart-define=API_BASE_URL=https://api.octagon-karate.online/api/v1
apksigner verify --print-certs build/app/outputs/flutter-apk/app-release.apk
```

В выводе должен быть ваш сертификат, а не `CN=Android Debug`.

## CI

Чтобы APK из GitHub Actions подписывался тем же ключом, добавьте секреты
репозитория (Settings → Secrets and variables → Actions):

| Секрет | Что внутри |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 octagon-release.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | пароль хранилища |
| `ANDROID_KEY_PASSWORD` | пароль ключа |
| `ANDROID_KEY_ALIAS` | `octagon-release` |

Workflow собирает `key.properties` из секретов перед `flutter build`. Если
секреты не заданы, шаг пропускается и CI собирает debug-подписанный APK — это
видно по предупреждению в логе.

## Хранение и восстановление

- `.jks` и `key.properties` **не коммитить** (они в `.gitignore`).
- Хранить в менеджере секретов + офлайн-копия (ключ нельзя восстановить).
- Потеря ключа = невозможность обновить приложение в сторах: придётся
  публиковать новый пакет (`applicationId`), потеряв установки.

## Проверка, что подпись применилась

```bash
unzip -p app-release.apk META-INF/*.RSA | keytool -printcert | head -20
```

Владелец сертификата должен совпадать с тем, что создан `keytool` выше.
