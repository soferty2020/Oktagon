import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NodeEnv, resolveCorsOrigins, type AppEnvironment } from '@octagon/config';

import { AppModule } from './app.module';
import { ApiExceptionFilter, SecurityHeadersMiddleware } from './shared';

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
  //
  // CORS: список источников приходит из конфигурации. `origin: true` вместе с
  // `credentials: true` означало бы, что любой сторонний сайт обращается к API с
  // cookie админки (docs/15-security.md). В production список обязателен, это
  // проверяет валидация окружения при старте.
  app.enableCors({
    origin: resolveCorsOrigins({
      NODE_ENV: config.get('NODE_ENV', { infer: true }),
      CORS_ORIGINS: config.get('CORS_ORIGINS', { infer: true }),
    }),
    credentials: true,
  });
  // Заголовки безопасности на все ответы. HSTS включается только в production:
  // в local и staging браузер работает по HTTP, и заголовок лишь мешал бы.
  const isProduction = config.get('NODE_ENV', { infer: true }) === NodeEnv.PRODUCTION;
  const securityHeaders = new SecurityHeadersMiddleware(isProduction);
  app.use(securityHeaders.use.bind(securityHeaders));
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
