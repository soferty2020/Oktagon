import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

/**
 * Описание API, из которого строится снапшот (#44).
 *
 * Вынесено из `main.ts`: генератор и рантайм должны описывать API одинаково,
 * иначе снапшот начнёт расходиться с реальностью, не заметив этого.
 */
export function buildOpenApiConfig() {
  return new DocumentBuilder()
    .setTitle('OCTAGON Club System API')
    .setDescription(
      'Backend API клуба карате OCTAGON. Контракт: docs/09-api.md, docs/23-api-contract-plan.md.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
}

export function buildOpenApiDocument(app: INestApplication) {
  return SwaggerModule.createDocument(app, buildOpenApiConfig());
}
