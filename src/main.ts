import 'node:crypto';
if (!global.crypto) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  (global as any).crypto = require('node:crypto');
}

import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { ValidationPipe, Logger } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import type { Server } from 'http';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  });

  process.on('uncaughtException', (err) => {
    logger.error('Uncaught Exception:', err);
    process.exit(1);
  });

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  process.on('SIGTERM', () => {
    logger.log('SIGTERM signal received: closing Nest application');
    app.close().then(() => {
      logger.log('Nest application closed successfully');
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    logger.log('SIGINT signal received');
    app.close().then(() => process.exit(0));
  });
  app.set('trust proxy', 1);
  
  // Explicit request logging middleware
  app.use((req, res, next) => {
    logger.log(`[Request] ${req.method} ${req.url}`);
    res.on('finish', () => {
      logger.log(`[Response] ${req.method} ${req.url} ${res.statusCode}`);
    });
    next();
  });

  app.use(cookieParser());
  app.enableCors({
    origin: ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'],
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe());

  const config = new DocumentBuilder()
    .setTitle('Proctor API')
    .setDescription('The Proctor API description')
    .setVersion('1.0')
    .addTag('System')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document);

  const port = process.env.PORT ?? 3000;
  
  const server = app.getHttpServer();

  // Attach listeners BEFORE starting the server
  server.on('connection', (socket) => {
    logger.log(`[TCP Connection] New connection from ${socket.remoteAddress}:${socket.remotePort}`);
  });

  server.on('error', (err) => {
    logger.error(`[Server Error] ${err.message}`);
  });

  await app.listen(port, '0.0.0.0');
  
  // Adjust Node.js server timeouts for proxy compatibility
  server.keepAliveTimeout = 65000; 
  server.headersTimeout = 66000;

  logger.log(`Application is running on: http://0.0.0.0:${port}`);
}
bootstrap();
