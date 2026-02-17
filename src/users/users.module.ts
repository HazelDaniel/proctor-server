import { Module } from '@nestjs/common';
import { AvatarService } from './avatar.service';
import { UsersService } from './users.service';

@Module({
  providers: [UsersService, AvatarService],
  exports: [UsersService, AvatarService],
})
export class UsersModule {}
