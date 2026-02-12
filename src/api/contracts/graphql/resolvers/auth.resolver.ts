import { Args, Mutation, Resolver } from '@nestjs/graphql';
import { AuthService } from '../../../../auth/auth.service';
import { AuthResult } from '../types';

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Mutation(() => Boolean)
  async requestLogin(@Args('email') email: string): Promise<boolean> {
    const token = await this.authService.requestLogin(email);
    // NOTE: In production we'd email this.
    // For now we'll log it.
    console.log(`[AUTH] Login token for ${email}: ${token}`);
    return true;
  }

  @Mutation(() => AuthResult)
  async verifyLogin(
    @Args('email') email: string,
    @Args('token') token: string,
  ): Promise<AuthResult> {
    return this.authService.verifyLogin(email, token);
  }
}
