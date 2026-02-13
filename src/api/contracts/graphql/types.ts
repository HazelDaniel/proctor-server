import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ToolInstance {
  @Field(() => ID) id!: string;
  @Field() toolType!: string;
  @Field(() => ID) docId!: string;
  @Field() createdAt!: string;
  @Field({ nullable: true }) archivedAt?: string;
  @Field(() => Boolean) iOwn!: boolean;
}

@ObjectType()
export class ValidationError {
  @Field() path!: string;
  @Field() message!: string;
}

@ObjectType()
export class ValidationResult {
  @Field() valid!: boolean;
  @Field(() => [ValidationError]) errors!: ValidationError[];
}

@ObjectType()
export class CreateToolInstanceResult {
  @Field(() => ToolInstance) instance!: ToolInstance;
}

@ObjectType()
export class ToolInstanceInvite {
  @Field(() => ID) id!: string;
  @Field(() => ID) instanceId!: string;
  @Field() invitedEmail!: string;
  @Field() status!: string;
  @Field() createdAt!: string;
  @Field() expiresAt!: string;
  @Field({ nullable: true }) acceptedAt?: string;
  @Field({ nullable: true }) revokedAt?: string;
}

@ObjectType()
export class CreateInviteResult {
  // NOTE: In production we’d return true and email the link.
  @Field() token!: string;
  @Field() invitedEmail!: string;
  @Field() expiresAt!: string;
}

@ObjectType()
export class ToolInstanceMember {
  @Field() userId!: string;
  @Field() role!: 'owner' | 'member';
}

@ObjectType()
export class MyInvite {
  @Field(() => ID) inviteId!: string;
  @Field(() => ID) instanceId!: string;
  @Field() invitedEmail!: string;
  @Field() status!: string;
  @Field() expiresAt!: string;
  @Field() createdAt!: string;

  // Useful for UI
  @Field({ nullable: true }) toolType?: string;
  @Field() inviterEmail!: string;
}

@ObjectType()
export class SentInvite {
  @Field(() => ID) id!: string;
  @Field(() => ID) instanceId!: string;
  @Field() invitedEmail!: string;
  @Field() status!: string;
  @Field() createdAt!: string;
  @Field() expiresAt!: string;
  @Field({ nullable: true }) toolType?: string;
}

@ObjectType()
export class User {
  @Field(() => ID) id!: string;
  @Field() email!: string;
}

@ObjectType()
export class AuthResult {
  @Field() token!: string;
  @Field(() => User) user!: User;
}
