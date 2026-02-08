import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET!,
      signOptions: { algorithm: 'HS256' }, // adjust if you use RS256
    }),
  ],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
