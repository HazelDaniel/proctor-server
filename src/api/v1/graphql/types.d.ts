import type { Request, Response } from 'express';

export interface GraphQLContext {
  req: Request;
  res?: Response;

  /**
   * Authenticated user id (null if unauthenticated)
   */
  userId: string | null;
}
