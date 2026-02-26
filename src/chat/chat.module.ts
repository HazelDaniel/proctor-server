import { Module, OnModuleInit } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatGateway } from './chat.gateway';
import { AuthModule } from 'src/auth/auth.module';
import { ChatResolver } from 'src/api/contracts/graphql/resolvers/chat.resolver';
import { ToolinstanceModule } from 'src/toolinstance/toolinstance.module';
import { UsersModule } from 'src/users/users.module';

@Module({
  imports: [AuthModule, ToolinstanceModule, UsersModule],
  providers: [
    ChatService,
    ChatGateway,
    ChatResolver,
  ],
  exports: [ChatService],
})
export class ChatModule implements OnModuleInit {
  constructor(
    private readonly chatService: ChatService,
    private readonly chatGateway: ChatGateway,
  ) {}

  onModuleInit() {
    this.chatService.setGateway(this.chatGateway);
  }
}
