import { Module } from '@nestjs/common';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { ToolModule } from 'src/tools/tools.module';
import { ToolInstanceResolver } from 'src/api/contracts/graphql/resolvers/tool-instance.resolver';
import { CollaborationModule } from 'src/collaboration/collaboration.module';
import { ToolinstanceModule } from 'src/toolinstance/toolinstance.module';
import { GraphQLContext } from './types';
import { AuthService } from 'src/auth/auth.service';
import type { Request, Response } from 'express';
import { AuthModule } from 'src/auth/auth.module';
import { InvitesService } from 'src/invites/invites.service';
import { UsersModule } from 'src/users/users.module';

import { SignedInGuard } from 'src/common/guards/signed-in.guard';
import { ToolInstanceAccessGuard } from 'src/common/guards/tool-instance-access.guard';
import { UserOwnershipGuard } from 'src/common/guards/user-ownership.guard';

@Module({
  imports: [
    ToolModule,
    CollaborationModule,
    UsersModule,
    ToolinstanceModule,
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      inject: [AuthService],
      imports: [AuthModule],
      useFactory: (authService: AuthService) => ({
        autoSchemaFile: true,
        // playground: false,
        introspection: true,

        context: async ({ req, res }: { req: Request; res: Response }): Promise<GraphQLContext> => {
          // Try to get token from header or cookie
          const authHeader = String(req.headers['authorization'] ?? '');
          let token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

          if (!token && req.cookies && req.cookies['access_token']) {
            token = req.cookies['access_token'];
          }

          let userId: string | null = null;

          if (token) {
            try {
              // Now async
              const result = await authService.verifyToken(token);
              userId = result.userId;
            } catch {
              userId = null;
            }
          }


          return {
            req,
            res,
            userId,
          };
        },

      }),
    }),
  ],
  providers: [
    ToolInstanceResolver,
    InvitesService,
    SignedInGuard,
    ToolInstanceAccessGuard,
    UserOwnershipGuard,
  ],
})
export class AppGraphqlModule {}
