import { Module } from '@nestjs/common';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GraphQLModule } from '@nestjs/graphql';
import { ToolModule } from 'src/tools/tools.module';
import { ToolInstanceResolver } from 'src/api/contracts/graphql/resolvers/tool-instance.resolver';
import { CollaborationModule } from 'src/collaboration/collaboration.module';
import { ToolinstanceModule } from 'src/toolinstance/toolinstance.module';
import { GraphQLContext } from './types';
import { AuthService } from 'src/auth/auth.service';
import type { Request } from 'express';
import { AuthModule } from 'src/auth/auth.module';
import { InvitesService } from 'src/invites/invites.service';
import { UsersModule } from 'src/users/users.module';

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
        playground: true,

        context: ({ req }: { req: Request }): GraphQLContext => {
          const authHeader = String(req.headers['authorization'] ?? '');
          const token = authHeader.startsWith('Bearer ')
            ? authHeader.slice(7)
            : '';

          let userId: string | null = null;

          if (token) {
            try {
              userId = authService.verifyToken(token).userId;
            } catch {
              userId = null;
            }
          }

          return {
            req,
            userId,
          };
        },
      }),
    }),
  ],
  providers: [ToolInstanceResolver, InvitesService],
})
export class AppGraphqlModule {}
