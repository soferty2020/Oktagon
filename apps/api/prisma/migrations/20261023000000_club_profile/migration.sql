-- Профиль клуба: единственная строка с фиксированным идентификатором.
--
-- Секреты и параметры инфраструктуры в таблице не хранятся (docs/26-admin-settings.md).
-- Часовой пояс — IANA-имя, валидируется на API: опечатка испортила бы расписание.

CREATE TABLE "club_profile" (
    "id" VARCHAR(16) NOT NULL DEFAULT 'default',
    "name" VARCHAR(200) NOT NULL,
    "logo_url" VARCHAR(500),
    "phone" VARCHAR(32),
    "email" VARCHAR(200),
    "address" VARCHAR(500),
    "timezone" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_profile_pkey" PRIMARY KEY ("id")
);

-- Единственность строки: второй профиль клуба не имеет смысла и развел бы данные
-- по двум источникам.
ALTER TABLE "club_profile"
    ADD CONSTRAINT "club_profile_singleton" CHECK ("id" = 'default');
