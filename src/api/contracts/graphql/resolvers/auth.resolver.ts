import { Args, Mutation, Query, Resolver, Context } from '@nestjs/graphql';
import { AuthService } from '../../../../auth/auth.service';
import { AuthResult, User, Profile } from '../types';
import type { GraphQLContext } from '../../../v1/graphql/types';


import { UsersService } from '../../../../users/users.service';
import { UnauthenticatedError } from '../../../../common/errors/domain-errors';

@Resolver()
export class AuthResolver {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Mutation(() => Boolean)
  async requestLogin(
    @Args('email') email: string,
    @Args('username', { nullable: true }) username?: string,
  ): Promise<boolean> {
    await this.authService.requestLogin(email, username);
    return true;
  }

  @Mutation(() => AuthResult)
  async verifyLogin(
    @Args('email') email: string,
    @Args('token') token: string,
    @Args('rememberMe', { defaultValue: false }) rememberMe: boolean,
    @Context() ctx: GraphQLContext,
  ): Promise<AuthResult> {
    const result = await this.authService.verifyLogin(email, token, rememberMe);

    // Set refresh token in httpOnly cookie
    if (ctx.res) {
      ctx.res.cookie('refresh_token', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });
      
      // Also set access token in cookie as requested
      ctx.res.cookie('access_token', result.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000, // 15 minutes
      });
    }

    return {
      token: result.token,
      user: {
        ...result.user,
        userId: result.user.id,
      } as User,
    };
  }

  @Mutation(() => AuthResult)
  async refreshToken(@Context() ctx: GraphQLContext): Promise<AuthResult> {
    const refreshToken = ctx.req.cookies?.['refresh_token'];
    if (!refreshToken) throw new UnauthenticatedError('No refresh token provided');

    const result = await this.authService.refreshToken(refreshToken);

    if (ctx.res) {
      ctx.res.cookie('refresh_token', result.refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      ctx.res.cookie('access_token', result.accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 15 * 60 * 1000,
      });
    }

    const user = await this.usersService.getById(ctx.userId!);
    
    return {
      token: result.accessToken,
      user: {
        ...user,
        userId: user?.id,
      } as User,
    };
  }

  @Query(() => User, { nullable: true })
  async getCurrentUser(@Context() ctx: GraphQLContext): Promise<User | null> {
    if (!ctx.userId) return null;
    const user = await this.usersService.getById(ctx.userId);
    if (!user) return null;
    return {
      ...user,
      userId: user.id,
    } as User;
  }

  @Query(() => Profile, { nullable: true })
  async getMyProfile(@Context() ctx: GraphQLContext): Promise<Profile | null> {
    if (!ctx.userId) return null;
    const user = await this.usersService.getById(ctx.userId);
    if (!user) return null;
    
    return {
      ...user,
      userId: user.id,
      createdAt: user.createdAt.toISOString(),
    } as Profile;
  }


  @Mutation(() => Boolean)
  async logout(@Context() ctx: GraphQLContext): Promise<boolean> {
    if (ctx.userId) {
      await this.usersService.updateLastLogout(ctx.userId);
    }
    if (ctx.res) {
      ctx.res.clearCookie('access_token');
      ctx.res.clearCookie('refresh_token');
    }
    return true;
  }

  @Mutation(() => Boolean)
  async deleteAccount(@Context() ctx: GraphQLContext): Promise<boolean> {
    if (!ctx.userId) throw new UnauthenticatedError();
    // In a real app, we would cascade delete or mark as deleted.
    // For now, we'll just logout the user as a placeholder.
    await this.logout(ctx);
    return true;
  }
}


