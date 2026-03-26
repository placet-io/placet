import { NestFactory } from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { ZodValidationPipe, cleanupOpenApiDoc } from 'nestjs-zod';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import { AppModule } from './app.module';

// Prisma returns BigInt for `size` columns — make them JSON-serialisable.
// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
(BigInt.prototype as BigInt & { toJSON: () => number }).toJSON = function () {
  return Number(this);
};

function validateEnv() {
  const required: string[] = ['DATABASE_URL', 'JWT_SECRET'];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`,
    );
  }

  if (
    process.env.NODE_ENV === 'production' &&
    process.env.JWT_SECRET === 'change-me-in-production'
  ) {
    throw new Error(
      'JWT_SECRET must be changed from the default value in production',
    );
  }
}

async function bootstrap() {
  validateEnv();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ maxParamLength: 500 }),
    { bufferLogs: true },
  );

  app.useGlobalPipes(new ZodValidationPipe());

  await app.register(fastifyCookie as Parameters<typeof app.register>[0]);
  await app.register(fastifyMultipart as Parameters<typeof app.register>[0], {
    limits: { fileSize: 100 * 1024 * 1024 }, // 100 MB
  });

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
