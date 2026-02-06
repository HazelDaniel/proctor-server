import { Module } from '@nestjs/common';
import { db } from './db.provider';
import { DbService } from './db.service';

export const DB_PROVIDER = Symbol('DB_PROVIDER');

@Module({
  providers: [{ provide: DB_PROVIDER, useFactory: () => db }, DbService],
  exports: [DbService],
})
export class DbModule {}
