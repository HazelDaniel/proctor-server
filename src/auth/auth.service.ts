import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AuthPayloadType } from './types';
import { UnauthenticatedError } from '../common/errors/domain-errors';

export type JwtUser = { userId: string };

@Injectable()
export class AuthService {
  constructor(private readonly jwt: JwtService) {}

  verifyToken(token: string): JwtUser {
    const payload = this.jwt.verify<AuthPayloadType>(token);

    // either `sub` or `userId` depedning on issuer
    const userId = String(payload?.sub ?? payload?.userId ?? '');
    if (!userId) throw new UnauthenticatedError('Token payload missing subject');

    return { userId };
  }
}
