import { Field, ID, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class ToolInstance {
  @Field(() => ID) id!: string;
  @Field() toolType!: string;
  @Field(() => ID) docId!: string;
  @Field() createdAt!: string;
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
