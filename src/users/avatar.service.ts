import { Injectable } from '@nestjs/common';

@Injectable()
export class AvatarService {
  /**
   * Generates a random seed for avatar generation
   */
  generateSeed(): string {
    return crypto.randomUUID();
  }

  /**
   * Returns the avatar URL for a given seed
   * Uses DiceBear API with 'avataaars' style
   */
  getAvatarUrl(seed: string): string {
    // Using avataaars style as it provides good unique avatars
    return `https://api.dicebear.com/9.x/avataaars/svg?seed=${encodeURIComponent(seed)}`;
  }
}
