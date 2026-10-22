-- Очистка демонстрационных данных.
--
-- Удаляет все бизнес-данные и пользователей, кроме суперадминистратора: остальные
-- записи создавались скриптами проверок и демонстрациями, и в базе они выглядят
-- как мусор из сотен «Группа 1791226564623».
--
-- Сохраняются:
-- - `users` с ролью SUPERADMIN: без него некому войти и некому создать первое
--   приглашение;
-- - `permissions`: справочник прав, он не демонстрационный.
--
-- Запуск: node scripts/reset-demo.mjs

TRUNCATE TABLE
  attendances,
  planned_absences,
  training_sessions,
  schedule_template_slots,
  schedule_templates,
  group_memberships,
  group_trainers,
  group_branches,
  groups,
  trainer_profiles,
  halls,
  branches,
  user_athletes,
  athletes,
  membership_periods,
  payment_transactions,
  freeze_periods,
  news_comments,
  news_posts,
  messages,
  conversation_members,
  conversations,
  audit_logs,
  user_invites,
  user_permissions,
  refresh_tokens
RESTART IDENTITY CASCADE;

-- Все, кроме суперадминистратора, созданы проверками и демо: после очистки
-- бизнес-данных их аккаунты ссылаются в пустоту.
DELETE FROM users WHERE role <> 'SUPERADMIN';
