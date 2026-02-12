import { Injectable } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { db } from 'src/db/db.provider';
import {
  toolInstanceInvites,
  toolInstanceMembers,
  toolInstances,
} from 'src/db/drivers/drizzle/schema';
import { normalizeEmail } from '../users/users.service';
import {
  NotFoundError,
  PermissionDeniedError,
  ValidationError,
} from '../common/errors/domain-errors';

function sha256Hex(input: string) {
  return createHash('sha256').update(input).digest('hex');
}

function newToken() {
  return randomBytes(32).toString('base64url');
}

@Injectable()
export class InvitesService {
  private readonly INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

  async createInvite(
    instanceId: string,
    ownerUserId: string,
    invitedEmail: string,
  ) {
    const inst = await db
      .select()
      .from(toolInstances)
      .where(eq(toolInstances.id, instanceId))
      .limit(1);
    if (!inst[0]) throw new NotFoundError('Tool instance');
    if (inst[0].ownerUserId !== ownerUserId) throw new PermissionDeniedError('Forbidden');

    const email = normalizeEmail(invitedEmail);
    const token = newToken();
    const tokenHash = sha256Hex(token);

    const now = new Date();
    const expiresAt = new Date(Date.now() + this.INVITE_TTL_MS);

    // Optional: prevent multiple pending invites for same email+instance
    // (simple approach: just insert; you can also check existing pending and re-use)
    await db.insert(toolInstanceInvites).values({
      id: crypto.randomUUID(),
      instanceId,
      invitedEmail: email,
      tokenHash,
      status: 'pending',
      createdByUserId: ownerUserId,
      createdAt: now,
      expiresAt,
    });

    // NOTE: in production, we email the raw token link.
    // but this is okay atm
    return { token, invitedEmail: email, expiresAt: expiresAt.toISOString() };
  }

  async listInvites(instanceId: string, ownerUserId: string) {
    const inst = await db
      .select()
      .from(toolInstances)
      .where(eq(toolInstances.id, instanceId))
      .limit(1);
    if (!inst[0]) throw new NotFoundError('Tool instance');
    if (inst[0].ownerUserId !== ownerUserId) throw new PermissionDeniedError('Forbidden');

    return db
      .select()
      .from(toolInstanceInvites)
      .where(eq(toolInstanceInvites.instanceId, instanceId));
  }

  async revokeInvite(inviteId: string, ownerUserId: string) {
    const inv = await db
      .select()
      .from(toolInstanceInvites)
      .where(eq(toolInstanceInvites.id, inviteId))
      .limit(1);
    if (!inv[0]) throw new NotFoundError('Invite');

    const inst = await db
      .select()
      .from(toolInstances)
      .where(eq(toolInstances.id, inv[0].instanceId))
      .limit(1);
    if (!inst[0]) throw new NotFoundError('Tool instance');
    if (inst[0].ownerUserId !== ownerUserId) throw new PermissionDeniedError('Forbidden');

    if (inv[0].status !== 'pending') return true;

    await db
      .update(toolInstanceInvites)
      .set({
        status: 'revoked',
        revokedAt: new Date(),
        revokedByUserId: ownerUserId,
      })
      .where(eq(toolInstanceInvites.id, inviteId));

    return true;
  }

  async myPendingInvites(userEmail: string) {
    const email = normalizeEmail(userEmail);

    // Optional: auto-expire any that are past expiresAt
    // Keep it simple for now: filter by expiresAt in code after fetch or with SQL if you prefer.

    const rows = await db
      .select()
      .from(toolInstanceInvites)
      .where(
        and(
          eq(toolInstanceInvites.invitedEmail, email),
          eq(toolInstanceInvites.status, 'pending'),
        ),
      );

    // Mark expired ones and exclude them
    const now = Date.now();
    const pending: typeof rows = [];
    for (const inv of rows) {
      if (inv.expiresAt.getTime() < now) {
        await db
          .update(toolInstanceInvites)
          .set({ status: 'expired' })
          .where(eq(toolInstanceInvites.id, inv.id));
      } else {
        pending.push(inv);
      }
    }

    return pending;
  }

  async acceptInvite(
    token: string,
    currentUserId: string,
    currentUserEmail: string,
  ) {
    const tokenHash = sha256Hex(token);
    const rows = await db
      .select()
      .from(toolInstanceInvites)
      .where(eq(toolInstanceInvites.tokenHash, tokenHash))
      .limit(1);
    if (!rows[0]) throw new ValidationError('Invalid invite token');

    const invite = rows[0];

    if (invite.status !== 'pending') throw new ValidationError('Invite is not pending');
    if (invite.expiresAt.getTime() < Date.now()) {
      await db
        .update(toolInstanceInvites)
        .set({ status: 'expired' })
        .where(eq(toolInstanceInvites.id, invite.id));
      throw new ValidationError('Invite expired');
    }

    // Prevent token forwarding: only the invited email can accept
    const email = normalizeEmail(currentUserEmail);
    if (email !== invite.invitedEmail) throw new ValidationError('Invite email mismatch');

    try {
      await db.insert(toolInstanceMembers).values({
        instanceId: invite.instanceId,
        userId: currentUserId,
      });
    } catch {
      // already member, ignore
    }

    await db
      .update(toolInstanceInvites)
      .set({
        status: 'accepted',
        acceptedAt: new Date(),
        acceptedByUserId: currentUserId,
      })
      .where(eq(toolInstanceInvites.id, invite.id));

    return true;
  }

  async declineInvite(inviteId: string, userEmail: string) {
    const email = normalizeEmail(userEmail);

    const rows = await db
      .select()
      .from(toolInstanceInvites)
      .where(eq(toolInstanceInvites.id, inviteId))
      .limit(1);

    if (rows.length === 0) throw new NotFoundError('Invite');

    const inv = rows[0];

    if (inv.invitedEmail !== email) throw new PermissionDeniedError('Forbidden');
    if (inv.status !== 'pending') return true;

    // decline means: stop showing in pending list
    await db
      .update(toolInstanceInvites)
      .set({ status: 'declined' })
      .where(eq(toolInstanceInvites.id, inviteId));
    return true;
  }
}
