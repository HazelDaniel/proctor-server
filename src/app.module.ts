import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DbModule } from './db/db.module';
import { ConfigModule } from '@nestjs/config';
import { z } from 'zod';
import { ToolModule } from './tools/tools.module';
// import { DocumentRegistryService } from './document-registry/document-registry.service';
import { DocumentRegistry } from './document-registry/document-registry.service';

const envSchema = z.object({
  DATABASE_URL: z.url(),
  PORT: z.string().optional(),
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
    ToolModule,
  ],
  controllers: [AppController],
  providers: [AppService, DocumentRegistry],
})
export class AppModule {}
