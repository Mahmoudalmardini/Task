import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  const config = app.get(ConfigService);
  const logger = new Logger('Bootstrap');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  const swagger = new DocumentBuilder()
    .setTitle('Delivery Operations API')
    .setDescription(
      'Backend service for managing captains, orders, live location updates, and partner integrations.',
    )
    .setVersion('1.0.0')
    .addTag('Auth', 'Admin authentication')
    .addTag('Captains', 'Captain CRUD and activation')
    .addTag('Orders', 'Order CRUD, assignment, and advanced list')
    .addTag('Partner', 'External partner integration (X-API-Key)')
    .addTag('Reports', 'Admin reporting and analytics')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', name: 'Authorization', in: 'header' },
      'admin-jwt',
    )
    .addApiKey({ type: 'apiKey', name: 'X-API-Key', in: 'header' }, 'partner-api-key')
    .build();

  const document = SwaggerModule.createDocument(app, swagger);
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });

  const port = config.get<number>('port') || 3000;
  await app.listen(port);
  logger.log(`Application running on http://localhost:${port}`);
  logger.log(`Swagger UI:      http://localhost:${port}/api`);
  logger.log(`OpenAPI JSON:    http://localhost:${port}/api-json`);
}

bootstrap();
