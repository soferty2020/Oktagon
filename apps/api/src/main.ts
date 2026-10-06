import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { AppEnvironment } from '@octagon/config';

import { AppModule } from './app.module';
import { ApiExceptionFilter } from './shared';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const config = app.get(ConfigService<AppEnvironment, true>);

  const apiPrefix = config.get('API_PREFIX', { infer: true });
  const port = config.get('PORT', { infer: true });

  app.setGlobalPrefix(apiPrefix);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  // Интерсепторы зарегистрированы в AppModule через APP_INTERCEPTOR: контексту
  // запроса нужен DI. Порядок — requestId, затем контекст аудита.
  app.enableCors({ origin: true, credentials: true });
  app.enableShutdownHooks();

  const swaggerConfig = new DocumentBuilder()
    .setTitle('OCTAGON Club System API')
    .setDescription(
      'Backend API клуба карате OCTAGON. Контракт: docs/09-api.md, docs/23-api-contract-plan.md.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
    jsonDocumentUrl: `${apiPrefix}/openapi.json`,
  });

  await app.listen(port);
  logger.log(`OCTAGON API listening on http://localhost:${port}/${apiPrefix}`);
}

void bootstrap();
