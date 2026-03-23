import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { ZodValidationPipe, cleanupOpenApiDoc } from 'nestjs-zod';
import fastifyCookie from '@fastify/cookie';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bufferLogs: true },
  );

  app.useGlobalPipes(new ZodValidationPipe());

  await app.register(fastifyCookie as Parameters<typeof app.register>[0]);

  app.useLogger(app.get(Logger));

  const corsOrigin = process.env.CORS_ORIGIN;
  app.enableCors({
    origin: corsOrigin === '*' || !corsOrigin ? true : corsOrigin.split(','),
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('HumanProxy API')
    .setDescription('Chat-based agent inbox for AI-human interaction')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addCookieAuth('access_token')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, cleanupOpenApiDoc(document));

  const port = process.env.BACKEND_PORT ?? 3001;
  await app.listen(port, '0.0.0.0');
}
void bootstrap();
