import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDb } from './db.provider';
import { DbService } from './db.service';

export const DB_PROVIDER = 'DB_PROVIDER';

@Global()
@Module({
  providers: [
    {
      provide: DB_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('DATABASE_URL');
        if (!url) throw new Error('DATABASE_URL not found in config');
        return createDb(url);
      },
    },
    DbService,
  ],
  exports: [DB_PROVIDER, DbService],
})
export class DbModule {}
