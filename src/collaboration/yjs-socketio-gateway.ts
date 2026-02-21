import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { DefaultEventsMap, Server, Socket } from 'socket.io';
import type { Doc } from 'yjs' with { 'resolution-mode': 'import' };

import type * as AwarenessNS from 'y-protocols/awareness' with {
  'resolution-mode': 'import',
};

import { DocumentRegistry } from 'src/document-registry/document-registry.service';
import { ToolRegistry } from 'src/tools/registry';
import { ToolInstanceService } from 'src/toolinstance/toolinstance.service';
import { loadYjsProtocols } from 'src/import-resolution/yjs';
import { SocketData } from './socket.types';
import { UsersService } from 'src/users/users.service';
import { AvatarService } from 'src/users/avatar.service';

let awarenessProtocol: typeof AwarenessNS;

const awarenessProtocolP = import('y-protocols/awareness');

async function getAwareness() {
  return await awarenessProtocolP;
}

void (async () => (awarenessProtocol = await getAwareness()))();

type ClientSocket = Socket<
  DefaultEventsMap, // events client -> server
  DefaultEventsMap, // events server -> client
  DefaultEventsMap, // inter-server events (usually DefaultEventsMap)
  SocketData
>;

const ROOM = (docId: string) => `doc:${docId}`;

// wire format: first varUint is message type
const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

@WebSocketGateway({
  path: '/collab',
  cors: {
    origin: 'http://localhost:5173',
    credentials: true,
  },
})
export class YjsSocketIoGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly docs: DocumentRegistry,
    private readonly tools: ToolRegistry,
    private readonly instances: ToolInstanceService,
    private readonly usersService: UsersService,
    private readonly avatarService: AvatarService,
  ) {}

  // Tracks which Yjs clientID is associated with which Socket.id
  private readonly socketIdToClientId = new Map<string, number>();

  // ---- Feature 2: awareness batching state ----
  private readonly AWARENESS_FLUSH_MS = 25;
  private awarenessTimers = new Map<string, NodeJS.Timeout | null>();
  private latestAwarenessPayload = new Map<string, Uint8Array>();

  // NOTE: you already keep awareness in registry; this map is used by your current design.
  private awarenessByDoc = new Map<string, AwarenessNS.Awareness>();

  // Keep only what we actually need for cleanup. We no longer attach doc update broadcasters.
  private attachedByDoc = new Map<
    string,
    { doc: Doc; onAwareness: (...args: any[]) => void }
  >();

  private queueAwareness(docId: string, senderId: string, payload: Uint8Array) {
    this.latestAwarenessPayload.set(docId, payload);

    if (this.awarenessTimers.get(docId)) return;

    const t = setTimeout(() => {
      this.awarenessTimers.set(docId, null);

      const p = this.latestAwarenessPayload.get(docId);
      if (!p) return;

      // Echo suppression: exclude sender (best-effort: last sender in window)
      this.server.to(ROOM(docId)).except(senderId).emit('yjs:awareness', p);
    }, this.AWARENESS_FLUSH_MS);

    this.awarenessTimers.set(docId, t);
  }

  private async broadcastViewers(docId: string) {
    const sockets = await this.server.in(ROOM(docId)).fetchSockets();
    const seenUserIds = new Set<string>();
    const viewers: { userId: string; avatarUrl: string | null }[] = [];

    for (const s of sockets) {
      const uid = s.data.userId;
      if (!uid || seenUserIds.has(uid)) continue;
      seenUserIds.add(uid);

      const user = await this.usersService.getById(uid);
      viewers.push({
        userId: uid,
        avatarUrl: user
          ? this.avatarService.getAvatarUrl(user.avatarSeed)
          : null,
      });
    }

    this.server.to(ROOM(docId)).emit('presence:viewers', { viewers });
  }

  async handleConnection(client: ClientSocket) {
    // Expect client handshake auth: { instanceId, token }
    const { encoding, sync: syncProtocol } = await loadYjsProtocols();

    const instanceId = String(client.handshake.auth?.instanceId ?? '');
    const token = String(client.handshake.auth?.token ?? '');

    if (!instanceId || !token) {
      client.disconnect(true);
      return;
    }

    const inst = await this.instances.getDocByInstanceId(instanceId);
    if (!inst) {
      client.disconnect(true);
      return;
    }

    if (inst.archivedAt) {
      client.disconnect(true);
      return;
    }

    const { docId, toolType } = inst;

    if (!this.tools.has(toolType)) {
      client.disconnect(true);
      return;
    }

    // attach to socket for disconnect
    client.data.docId = docId;
    client.data.toolType = toolType;
    client.data.instanceId = instanceId;
    client.data.userId = token; // replace with JWT subject later

    await client.join(ROOM(docId));

    const acquisition = await this.docs.acquire(docId, toolType);

    // Ensure one Awareness instance per doc in memory
    let awareness: AwarenessNS.Awareness =
      acquisition.awareness as AwarenessNS.Awareness;

    type AwarenessUpdate = {
      added: number[];
      updated: number[];
      removed: number[];
    };

    if (!awareness) {
      // If this can happen, registry should ideally create awareness during loadOrCreate.
      awareness = new awarenessProtocol.Awareness(acquisition.doc as Doc);
      this.awarenessByDoc.set(docId, awareness);
    } else {
      // Keep the map in sync with the session so onAwareness can resolve it reliably.
      this.awarenessByDoc.set(docId, awareness);
    }

    // Feature 2 change:
    // - DO NOT attach doc.on('update') broadcaster (it causes echo and duplicates)
    // - Only attach awareness broadcaster (optional). We can keep it for server-origin awareness updates.
    if (!this.attachedByDoc.has(docId)) {
      const { encoding } = await loadYjsProtocols();

      const onAwarenessUpdate = ({
        added,
        updated,
        removed,
      }: AwarenessUpdate) => {
        const changed: number[] = added.concat(updated, removed);
        const update = awarenessProtocol.encodeAwarenessUpdate(
          awareness,
          changed,
        );

        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, MSG_AWARENESS);
        encoding.writeVarUint8Array(enc, update);

        // This is awareness (ephemeral). Broadcasting to all is OK; client batching is for incoming events.
        this.server
          .to(ROOM(docId))
          .emit('yjs:awareness', encoding.toUint8Array(enc));
      };

      awareness.on('update', onAwarenessUpdate);

      this.attachedByDoc.set(docId, {
        doc: acquisition.doc as Doc,
        onAwareness: onAwarenessUpdate,
      });
    }

    // Initial sync step 1 (to this client only)
    {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_SYNC);
      syncProtocol.writeSyncStep1(enc, acquisition.doc as Doc);
      client.emit('yjs:sync', encoding.toUint8Array(enc));
    }

    // Send awareness states to this client
    {
      const states = Array.from(awareness.getStates().keys());
      const update = awarenessProtocol.encodeAwarenessUpdate(awareness, states);

      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_AWARENESS);
      encoding.writeVarUint8Array(enc, update);

      client.emit('yjs:awareness', encoding.toUint8Array(enc));
    }

    client.emit('yjs:ready', { docId, toolType });

    // Broadcast updated viewer list to all existing clients in the room,
    // then send a dedicated copy directly to the new joiner so they receive
    // the current viewer list regardless of listener-registration timing.
    await this.broadcastViewers(docId);
  }

  async handleDisconnect(client: ClientSocket) {
    const docId = String(client.data.docId ?? '');
    if (!docId) return;

    // Remove the client's awareness state so others see them leave
    const awareness = this.awarenessByDoc.get(docId);
    if (awareness) {
      const clientId = this.socketIdToClientId.get(client.id);
      if (clientId !== undefined) {
        awarenessProtocol.removeAwarenessStates(awareness, [clientId], this);
        this.socketIdToClientId.delete(client.id);
      }
    }

    await Promise.resolve();

    this.docs.release(docId);

    // If room is empty, we can cleanup awareness/broadcasters + batching state
    const room = this.server.sockets.adapter.rooms.get(ROOM(docId));
    const roomSize: number = room ? room.size : 0;

    if (roomSize === 0) {
      const attached = this.attachedByDoc.get(docId);
      const session = this.docs.getSession(docId);

      if (attached && session?.awareness) {
        (session.awareness as AwarenessNS.Awareness).off(
          'update',
          attached.onAwareness,
        );
        this.attachedByDoc.delete(docId);
      }

      const awareness = this.awarenessByDoc.get(docId);
      if (awareness) {
        awareness.destroy();
        this.awarenessByDoc.delete(docId);
      }

      const t = this.awarenessTimers.get(docId);
      if (t) clearTimeout(t);
      this.awarenessTimers.delete(docId);
      this.latestAwarenessPayload.delete(docId);
    } else {
      // Room still has viewers — broadcast updated viewer list
      await this.broadcastViewers(docId);
    }
  }

  @SubscribeMessage('yjs:sync')
  async onSync(
    @ConnectedSocket() client: ClientSocket,
    @MessageBody() data: ArrayBuffer | Uint8Array,
  ) {
    const docId = String(client.data.docId ?? '');
    const toolType = String(client.data.toolType ?? '');
    if (!docId || !toolType) return;

    const { encoding, decoding, sync: syncProtocol } = await loadYjsProtocols();
    const acquisition = await this.docs.acquire(docId, toolType);

    try {
      const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
      const dec = decoding.createDecoder(u8);

      const msgType = decoding.readVarUint(dec);
      if (msgType !== MSG_SYNC) return;

      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_SYNC);

      // Apply to doc and possibly generate a reply for sender
      syncProtocol.readSyncMessage(dec, enc, acquisition.doc as Doc, client);

      if (encoding.length(enc) > 1) {
        client.emit('yjs:sync', encoding.toUint8Array(enc));
      }

      // ---- Feature 2: echo suppression (broadcast to others only) ----
      this.server.to(ROOM(docId)).except(client.id).emit('yjs:sync', u8);
    } finally {
      this.docs.release(docId);
    }
  }

  @SubscribeMessage('yjs:awareness')
  async onAwareness(
    @ConnectedSocket() client: ClientSocket,
    @MessageBody() data: ArrayBuffer | Uint8Array,
  ) {
    const docId = String(client.data.docId ?? '');
    if (!docId) return;

    const { decoding } = await loadYjsProtocols();

    const awareness = this.awarenessByDoc.get(docId);
    if (!awareness) return;

    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    const dec = decoding.createDecoder(u8);

    const msgType = decoding.readVarUint(dec);
    if (msgType !== MSG_AWARENESS) return;

    const update = decoding.readVarUint8Array(dec);

    // To track the clientID for this socket, we can decode the awareness update
    // But since applyAwarenessUpdate does it for us, we can also extract it after
    // Another way is to just read the updated clientIDs from the awareness instance
    // Let's capture the clientId dynamically
    const dec2 = decoding.createDecoder(update);
    const len = decoding.readVarUint(dec2);
    if (len > 0) {
      const clientId = decoding.readVarUint(dec2);
      this.socketIdToClientId.set(client.id, clientId);
    }

    awarenessProtocol.applyAwarenessUpdate(awareness, update, client);

    this.queueAwareness(docId, client.id, u8);
  }
}
