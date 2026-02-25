import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { and, eq, desc } from 'drizzle-orm';
import {
  toolInstanceInvites,
  toolInstanceMembers,
  toolInstances,
  users,
} from 'src/db/drivers/drizzle/schema';
import { normalizeEmail } from '../users/users.service';
import {
  NotFoundError,
  PermissionDeniedError,
  ValidationError,
} from '../common/errors/domain-errors';
import { sha256Hex, newToken } from '../common/crypto';
import { NotificationService } from 'src/notifications/notification.service';
import { DB_PROVIDER } from '../db/db.module';
import type { DB } from '../db/db.provider';

@Injectable()
export class InvitesService {
  private readonly INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

  constructor(
    @Inject(DB_PROVIDER) private readonly db: DB,
    private readonly notificationService: NotificationService,
  ) {}

  async createInvite(
    instanceId: string,
    ownerUserId: string,
    inviteeEmail: string,
  ) {
    const inst = await this.db
      .select()
      .from(toolInstances)
      .where(eq(toolInstances.id, instanceId))
      .limit(1);
    if (!inst[0]) throw new NotFoundError('Tool instance');
    if (inst[0].ownerUserId !== ownerUserId) throw new PermissionDeniedError('Forbidden');
    
    // Fetch owner email
    const ownerRows = await this.db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, ownerUserId))
      .limit(1);
    if (!ownerRows[0]) throw new NotFoundError('User email');
    const ownerEmail = ownerRows[0].email;

    const email = normalizeEmail(inviteeEmail);
    const token = newToken();
    const tokenHash = sha256Hex(token);

    const now = new Date();
    const expiresAt = new Date(Date.now() + this.INVITE_TTL_MS);

    // Optional: prevent multiple pending invites for same email+instance
    // (simple approach: just insert; you can also check existing pending and re-use)
    await this.db.insert(toolInstanceInvites).values({
      id: crypto.randomUUID(),
      instanceId,
      inviteeEmail: email,
      inviterEmail: ownerEmail, // We should pass ownerEmail to this method now
      tokenHash,
      status: 'pending',
      createdByUserId: ownerUserId,
      createdAt: now,
      expiresAt,
    });

    // NOTE: in production, we email the raw token link.
    // but this is okay atm
    // Try to find the invitee user ID to send a notification
    const inviteeRows = await this.db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    
    if (inviteeRows[0]) {
      await this.notificationService.create(
        inviteeRows[0].id,
        'invite_received',
        {
          projectName: inst[0].name,
          inviterEmail: ownerEmail,
        },
        instanceId,
        email, // recipient email for fallback if they want email notifications
      );
    } else {
      // If user doesn't exist yet, we could still send an email via some standalone email service,
      // but NotificationService handles users. For now just passing email might work if we bypassed userId,
      // but our schema requires userId. So we only notify if the user exists.
      // We could use a dummy ID or just skip in-app notification and only send email.
      // Wait, let's just use the EmailService directly or let NotificationService handle it if we modify it.
      // The requirement says "log in to Proctor to accept", so it's fine.
    }

    return { token, inviteeEmail: email, expiresAt: expiresAt.toISOString() };
  }

  async listInvites(instanceId: string, ownerUserId: string) {
    const inst = await this.db
      .select()
      .from(toolInstances)
      .where(eq(toolInstances.id, instanceId))
      .limit(1);
    if (!inst[0]) throw new NotFoundError('Tool instance');
    if (inst[0].ownerUserId !== ownerUserId) throw new PermissionDeniedError('Forbidden');

    return this.db
      .select()
      .from(toolInstanceInvites)
      .where(eq(toolInstanceInvites.instanceId, instanceId));
  }

  async revokeInvite(inviteId: string, ownerUserId: string) {
    const inv = await this.db
      .select()
      .from(toolInstanceInvites)
      .where(eq(toolInstanceInvites.id, inviteId))
      .limit(1);
    if (!inv[0]) throw new NotFoundError('Invite');

    const inst = await this.db
      .select()
      .from(toolInstances)
      .where(eq(toolInstances.id, inv[0].instanceId))
      .limit(1);
    if (!inst[0]) throw new NotFoundError('Tool instance');
    if (inst[0].ownerUserId !== ownerUserId) throw new PermissionDeniedError('Forbidden');

    if (inv[0].status !== 'pending') return true;

    await this.db
      .update(toolInstanceInvites)
      .set({
        status: 'revoked',
        revokedAt: new Date(),
        revokedByUserId: ownerUserId,
      })
      .where(eq(toolInstanceInvites.id, inviteId));

    return true;
  }

  async myReceivedInvitations(userEmail: string) {
    const email = normalizeEmail(userEmail);

    // Optional: auto-expire any that are past expiresAt
    // Keep it simple for now: filter by expiresAt in code after fetch or with SQL if you prefer.

    const rows = await this.db
      .select()
      .from(toolInstanceInvites)
      .where(
        and(
          eq(toolInstanceInvites.inviteeEmail, email),
          eq(toolInstanceInvites.status, 'pending'),
        ),
      );

    // Mark expired ones and exclude them
    const now = Date.now();
    const pending: typeof rows = [];
    for (const inv of rows) {
      if (inv.expiresAt.getTime() < now) {
        await this.db
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
    const rows = await this.db
      .select()
      .from(toolInstanceInvites)
      .where(eq(toolInstanceInvites.tokenHash, tokenHash))
      .limit(1);
    if (!rows[0]) throw new ValidationError('Invalid invite token');

    const invite = rows[0];

    if (invite.status !== 'pending') throw new ValidationError('Invite is not pending');
    if (invite.expiresAt.getTime() < Date.now()) {
      await this.db
        .update(toolInstanceInvites)
        .set({ status: 'expired' })
        .where(eq(toolInstanceInvites.id, invite.id));
      throw new ValidationError('Invite expired');
    }

    // Prevent token forwarding: only the invited email can accept
    const email = normalizeEmail(currentUserEmail);
    if (email !== invite.inviteeEmail) throw new ValidationError('Invite email mismatch');

    try {
      await this.db.insert(toolInstanceMembers).values({
        instanceId: invite.instanceId,
        userId: currentUserId,
      });
    } catch {
      // already member, ignore
    }

    await this.db
      .update(toolInstanceInvites)
      .set({
        status: 'accepted',
        acceptedAt: new Date(),
        acceptedByUserId: currentUserId,
      })
      .where(eq(toolInstanceInvites.id, invite.id));

    // Notify owner that invite was accepted
    const instRows = await this.db.select({ ownerUserId: toolInstances.ownerUserId, name: toolInstances.name }).from(toolInstances).where(eq(toolInstances.id, invite.instanceId)).limit(1);
    if (instRows[0]) {
      await this.notificationService.create(
        instRows[0].ownerUserId,
        'invite_accepted',
        {
          projectName: instRows[0].name,
          accepterEmail: email,
        },
        invite.instanceId,
      );
    }

    return true;
  }

  async acceptInviteById(
    inviteId: string,
    currentUserId: string,
    currentUserEmail: string,
  ) {
    const rows = await this.db
      .select()
      .from(toolInstanceInvites)
      .where(eq(toolInstanceInvites.id, inviteId))
      .limit(1);

    if (!rows[0]) throw new NotFoundError('Invite');
    const invite = rows[0];

    if (invite.status !== 'pending')
      throw new ValidationError('Invite is not pending');
    if (invite.expiresAt.getTime() < Date.now()) {
      await this.db
        .update(toolInstanceInvites)
        .set({ status: 'expired' })
        .where(eq(toolInstanceInvites.id, invite.id));
      throw new ValidationError('Invite expired');
    }

    const email = normalizeEmail(currentUserEmail);
    if (email !== invite.inviteeEmail)
      throw new PermissionDeniedError('Forbidden');

    try {
      await this.db.insert(toolInstanceMembers).values({
        instanceId: invite.instanceId,
        userId: currentUserId,
      });
    } catch {
      // already member
    }

    await this.db
      .update(toolInstanceInvites)
      .set({
        status: 'accepted',
        acceptedAt: new Date(),
        acceptedByUserId: currentUserId,
      })
      .where(eq(toolInstanceInvites.id, invite.id));

    // Notify owner
    const instRows = await this.db.select({ ownerUserId: toolInstances.ownerUserId, name: toolInstances.name }).from(toolInstances).where(eq(toolInstances.id, invite.instanceId)).limit(1);
    if (instRows[0]) {
      await this.notificationService.create(
        instRows[0].ownerUserId,
        'invite_accepted',
        {
          projectName: instRows[0].name,
          accepterEmail: email,
        },
        invite.instanceId,
      );
    }

    return true;
  }

  async declineInvite(inviteId: string, userEmail: string) {
    const email = normalizeEmail(userEmail);

    const rows = await this.db
      .select()
      .from(toolInstanceInvites)
      .where(eq(toolInstanceInvites.id, inviteId))
      .limit(1);

    if (rows.length === 0) throw new NotFoundError('Invite');

    const inv = rows[0];

    if (inv.inviteeEmail !== email) throw new PermissionDeniedError('Forbidden');
    if (inv.status !== 'pending') return true;

    // decline means: stop showing in pending list
    await this.db
      .update(toolInstanceInvites)
      .set({ status: 'declined' })
      .where(eq(toolInstanceInvites.id, inviteId));
    return true;
  }

  async listSentPendingInvites(userId: string) {
    return this.db
      .select()
      .from(toolInstanceInvites)
      .where(
        and(
          eq(toolInstanceInvites.createdByUserId, userId),
          eq(toolInstanceInvites.status, 'pending'),
        ),
      )
      .orderBy(desc(toolInstanceInvites.createdAt));
  }
}
