/**
 * Генерация снапшота OpenAPI (#44).
 *
 * Запуск: `pnpm openapi:export [путь]` из `apps/api`. По умолчанию пишет
 * `openapi.yaml` в корень репозитория.
 *
 * Снапшот машинный, а не ручной: за #30–#42 появились десятки полей, и
 * расхождение контракта с кодом ловилось только у клиента в рантайме.
 *
 * YAML собирается собственным сериализатором: `js-yaml` тянет транзитивную
 * зависимость, а формат здесь простой — объекты, массивы, строки, числа и
 * булевы. Строки всегда в двойных кавычках: это валидная YAML-скалярная форма и
 * исключает споры об экранировании двоеточий в путях.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';
import { buildOpenApiDocument } from './openapi';

type YamlValue = string | number | boolean | null | YamlValue[] | { [key: string]: YamlValue };

/** Ключ можно писать без кавычек, только если это простой идентификатор. */
const SIMPLE_KEY = /^[A-Za-z_][A-Za-z0-9_-]*$/;

function isPlainObject(value: unknown): value is Record<string, YamlValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function scalar(value: string | number | boolean | null): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }
  // JSON.stringify даёт корректный YAML double-quoted скаляр.
  return JSON.stringify(value);
}

function toYaml(value: YamlValue, indent: number): string {
  const pad = ' '.repeat(indent);

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }

    return value
      .map((item) => {
        if (isPlainObject(item) || Array.isArray(item)) {
          const nested = toYaml(item, indent + 2);
          return `${pad}- ${nested.trimStart()}`;
        }

        return `${pad}- ${scalar(item as string | number | boolean | null)}`;
      })
      .join('\n');
  }

  if (isPlainObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      return '{}';
    }

    return keys
      .map((key) => {
        const child = value[key];
        const printedKey = SIMPLE_KEY.test(key) ? key : JSON.stringify(key);

        if (isPlainObject(child) || Array.isArray(child)) {
          const isEmpty = Array.isArray(child) ? child.length === 0 : Object.keys(child).length === 0;
          if (isEmpty) {
            return `${pad}${printedKey}: ${Array.isArray(child) ? '[]' : '{}'}`;
          }

          return `${pad}${printedKey}:\n${toYaml(child, indent + 2)}`;
        }

        return `${pad}${printedKey}: ${scalar(child as string | number | boolean | null)}`;
      })
      .join('\n');
  }

  return `${pad}${scalar(value as string | number | boolean | null)}`;
}

async function main(): Promise<void> {
  const target = process.argv[2] ?? join(__dirname, '..', '..', '..', 'openapi.yaml');

  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1');

  const document = buildOpenApiDocument(app);
  await app.close();

  const yaml = `${toYaml(document as unknown as YamlValue, 0)}\n`;
  writeFileSync(target, yaml, 'utf8');

  const paths = Object.keys((document as { paths?: Record<string, unknown> }).paths ?? {}).length;
  process.stdout.write(`OpenAPI снапшот: ${paths} путей → ${target}\n`);
}

void main();
