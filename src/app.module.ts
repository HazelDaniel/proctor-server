import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DbModule } from './db/db.module';
import { ConfigModule } from '@nestjs/config';
import { z } from 'zod';
import { ToolPersistenceService } from './toolpersistence/toolpersistence.service';
import { CollaborationModule } from './collaboration/collaboration.module';
import { AuthModule } from './auth/auth.module';
import { AppGraphqlModule } from './api/v1/graphql/graphql.module';
import { APP_FILTER } from '@nestjs/core';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ScheduleModule } from '@nestjs/schedule';

const envSchema = z.object({
  DATABASE_URL: z.url(),
  PORT: z.string().optional(),
  JWT_SECRET: z.string(),
});

@Module({
  imports: [
    DbModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', `.env.${process.env.NODE_ENV}`],
      validate: (config) => {
        const result = envSchema.safeParse(config);
        if (!result.success) throw new Error(result.error.message);
        return result.data;
      },
    }),
    CollaborationModule,
    AppGraphqlModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService, 
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
