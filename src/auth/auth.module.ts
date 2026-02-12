import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { ConfigService } from '@nestjs/config';
import { UsersModule } from '../users/users.module';
import { AuthResolver } from '../api/contracts/graphql/resolvers/auth.resolver';

@Module({
  imports: [
    UsersModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const secret = config.get<string>('JWT_SECRET');
        if (!secret) throw new Error('JWT_SECRET not found in environment');
        return {
          secret,
          signOptions: { algorithm: 'HS256', expiresIn: '7d' },
        };
      },
    }),
  ],
  providers: [AuthService, AuthResolver],
  exports: [AuthService],
})
export class AuthModule {}
