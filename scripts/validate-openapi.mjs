/**
 * Проверка openapi.yaml: разрешимость ссылок, обязательные поля, уникальность
 * operationId и соответствие маршрутам, которые реально отдает приложение.
 *
 * Запуск: node scripts/validate-openapi.mjs
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const specPath = join(repoRoot, 'openapi.yaml');

// js-yaml уже есть в дереве зависимостей Prisma; отдельная зависимость ради
// проверки не нужна.
const { load } = await import('js-yaml');

const spec = load(readFileSync(specPath, 'utf8'));
const problems = [];

if (spec.openapi !== '3.0.3') {
  problems.push(`ожидается openapi 3.0.3, найдено ${spec.openapi}`);
}
if (!spec.info?.title || !spec.info?.version) {
  problems.push('в info должны быть title и version');
}

/** Собирает все $ref и проверяет, что цель существует. */
function collectRefs(node, path = '#') {
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectRefs(item, `${path}/${index}`));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') {
        if (!value.startsWith('#/')) {
          problems.push(`${path}: внешняя ссылка не поддерживается: ${value}`);
          continue;
        }
        const target = value
          .slice(2)
          .split('/')
          .reduce((acc, part) => (acc == null ? acc : acc[part]), spec);
        if (target === undefined) {
          problems.push(`${path}: ссылка не разрешается: ${value}`);
        }
        continue;
      }
      collectRefs(value, `${path}/${key}`);
    }
  }
}

collectRefs(spec);

const operationIds = new Set();
const paths = spec.paths ?? {};
if (Object.keys(paths).length === 0) {
  problems.push('paths пуст');
}

for (const [route, item] of Object.entries(paths)) {
  if (!route.startsWith('/')) {
    problems.push(`маршрут не начинается со слэша: ${route}`);
  }
  for (const [method, operation] of Object.entries(item)) {
    if (!['get', 'post', 'put', 'patch', 'delete'].includes(method)) {
      continue;
    }
    const where = `${method.toUpperCase()} ${route}`;
    if (!operation.operationId) {
      problems.push(`${where}: нет operationId`);
    } else if (operationIds.has(operation.operationId)) {
      problems.push(`${where}: operationId не уникален (${operation.operationId})`);
    } else {
      operationIds.add(operation.operationId);
    }
    if (!Array.isArray(operation.tags) || operation.tags.length === 0) {
      problems.push(`${where}: нет tags`);
    }
    const responses = operation.responses ?? {};
    if (Object.keys(responses).length === 0) {
      problems.push(`${where}: нет responses`);
    }
    for (const [status, response] of Object.entries(responses)) {
      if (status !== 'default' && !/^[1-5]\d\d$/.test(status)) {
        problems.push(`${where}: некорректный статус ответа ${status}`);
      }
      if (response?.$ref) {
        continue;
      }
      if (!response?.description) {
        problems.push(`${where} -> ${status}: нет description`);
      }
    }
  }
}

/** Маршруты, которые обязаны быть в контракте (реализованы в приложении). */
const expectedRoutes = [
  ['get', '/health'],
  ['get', '/health/ready'],
  ['post', '/auth/login'],
  ['post', '/auth/refresh'],
  ['post', '/auth/logout'],
  ['post', '/auth/accept-invite'],
  ['get', '/me'],
  ['get', '/me/athletes'],
  ['get', '/users/invites'],
  ['post', '/users/invites'],
  ['get', '/users/{userId}/permissions'],
  ['post', '/users/{userId}/permissions'],
  ['delete', '/users/{userId}/permissions/{code}'],
  ['get', '/branches'],
  ['post', '/branches'],
  ['get', '/branches/{id}'],
  ['patch', '/branches/{id}'],
  ['delete', '/branches/{id}'],
  ['get', '/branches/{id}/halls'],
  ['post', '/branches/{id}/halls'],
  ['patch', '/halls/{id}'],
  ['delete', '/halls/{id}'],
  ['get', '/trainers'],
  ['post', '/trainers'],
  ['get', '/trainers/{id}'],
  ['patch', '/trainers/{id}'],
  ['delete', '/trainers/{id}'],
  ['get', '/athletes'],
  ['post', '/athletes'],
  ['get', '/athletes/{id}'],
  ['patch', '/athletes/{id}'],
  ['delete', '/athletes/{id}'],
  ['post', '/athletes/{id}/accounts'],
  ['delete', '/athletes/{id}/accounts/{userId}'],
  ['get', '/groups'],
  ['post', '/groups'],
  ['get', '/groups/by-athlete/{athleteId}'],
  ['get', '/groups/{id}'],
  ['patch', '/groups/{id}'],
  ['delete', '/groups/{id}'],
  ['post', '/groups/{id}/branches'],
  ['delete', '/groups/{id}/branches/{branchId}'],
  ['post', '/groups/{id}/trainers'],
  ['delete', '/groups/{id}/trainers/{trainerId}'],
  ['post', '/groups/{id}/members'],
  ['delete', '/groups/{id}/members/{athleteId}'],
  ['get', '/users'],
  ['get', '/schedule-templates'],
  ['post', '/schedule-templates'],
  ['get', '/schedule-templates/{id}'],
  ['delete', '/schedule-templates/{id}'],
  ['post', '/schedule-templates/{id}/publish'],
  ['post', '/schedule-templates/{id}/generate'],
  ['post', '/schedule-templates/{id}/slots'],
  ['patch', '/schedule-templates/{id}/slots/{slotId}'],
  ['delete', '/schedule-templates/{id}/slots/{slotId}'],
  ['get', '/training-sessions'],
  ['post', '/training-sessions'],
  ['get', '/training-sessions/{id}'],
  ['patch', '/training-sessions/{id}/move'],
  ['post', '/training-sessions/{id}/cancel'],
  ['get', '/training-sessions/{id}/attendance'],
  ['put', '/training-sessions/{id}/attendance'],
  ['delete', '/training-sessions/{id}/attendance/{athleteId}'],
  ['post', '/training-sessions/{id}/attendance/planned-absence'],
  ['delete', '/training-sessions/{id}/attendance/planned-absence/{athleteId}'],
  ['get', '/attendance/summary'],
  ['get', '/athletes/{id}/membership-periods'],
  ['get', '/athletes/{id}/membership-periods/{year}/{month}'],
  ['patch', '/membership-periods/{periodId}'],
  ['post', '/membership-periods/{periodId}/fully-paid'],
  ['post', '/membership-periods/{periodId}/payments'],
  ['post', '/membership-periods/{periodId}/refunds'],
  ['patch', '/payments/{paymentId}'],
  ['delete', '/payments/{paymentId}'],
  ['delete', '/refunds/{refundId}'],
  ['get', '/debts'],
  ['get', '/athletes/{id}/freezes'],
  ['post', '/athletes/{id}/freezes'],
  ['post', '/freezes/{freezeId}/close'],
];

for (const [method, route] of expectedRoutes) {
  if (!paths[route]?.[method]) {
    problems.push(`в контракте отсутствует реализованный маршрут: ${method.toUpperCase()} ${route}`);
  }
}

console.log(`маршрутов: ${Object.keys(paths).length}`);
console.log(`операций: ${operationIds.size}`);
console.log(`схем: ${Object.keys(spec.components?.schemas ?? {}).length}`);
console.log(`переиспользуемых ответов: ${Object.keys(spec.components?.responses ?? {}).length}`);

if (problems.length > 0) {
  console.error(`\nПроблемы (${problems.length}):`);
  for (const problem of problems) {
    console.error(` - ${problem}`);
  }
  process.exit(1);
}

console.log('\nКонтракт корректен.');
