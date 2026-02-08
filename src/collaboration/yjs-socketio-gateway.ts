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
import type { Doc } from 'yjs' with {
  'resolution-mode': 'import',
};

import type * as AwarenessNS from 'y-protocols/awareness' with {
  'resolution-mode': 'import',
};

import { DocumentRegistry } from 'src/document-registry/document-registry.service';
import { ToolRegistry } from 'src/tools/registry';
import { ToolInstanceService } from 'src/toolinstance/toolinstance.service';
import { loadYjsProtocols } from 'src/import-resolution/yjs';
import { SocketData } from './socket.types';

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
  cors: { origin: true },
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
  ) {}

  private awarenessByDoc = new Map<string, AwarenessNS.Awareness>();
  private attachedByDoc = new Map<
    string,
    { doc: Doc; onUpdate: any; onAwareness: any }
  >();

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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    let awareness: AwarenessNS.Awareness = acquisition.awareness;
    type AwarenessUpdate = {
      added: number[];
      updated: number[];
      removed: number[];
    };

    if (!awareness) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      awareness = new awarenessProtocol.Awareness(acquisition.doc);
      this.awarenessByDoc.set(docId, awareness);
    }

    // Attach broadcasters once per doc
    if (!this.attachedByDoc.has(docId)) {
      const { encoding, sync: syncProtocol } = await loadYjsProtocols();
      const onDocUpdate = (update: Uint8Array) => {
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, MSG_SYNC);
        syncProtocol.writeUpdate(enc, update);
        this.server
          .to(ROOM(docId))
          .emit('yjs:sync', encoding.toUint8Array(enc));
      };
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
        this.server
          .to(ROOM(docId))
          .emit('yjs:awareness', encoding.toUint8Array(enc));
      };

      (acquisition.doc as Doc).on('update', onDocUpdate);
      awareness.on('update', onAwarenessUpdate);

      this.attachedByDoc.set(docId, {
        doc: acquisition.doc as Doc,
        onUpdate: onDocUpdate,
        onAwareness: onAwarenessUpdate,
      });
    }
    // if (!this.attachedByDoc.has(docId)) {
    //   const {
    //     awareness,
    //     encoding,
    //     sync: syncProtocol,
    //   } = await loadYjsProtocols();
    //   const onDocUpdate = (update: Uint8Array, origin: any) => {
    //     // origin will be the socket that applied it (we pass it in readSyncMessage)
    //     const enc = encoding.createEncoder();
    //     encoding.writeVarUint(enc, MSG_SYNC);
    //     syncProtocol.writeUpdate(enc, update);
    //     const payload = encoding.toUint8Array(enc);

    //     // broadcast to room
    //     this.server.to(ROOM(docId)).emit('yjs:sync', payload);
    //   };

    //   const onAwarenessUpdate = (
    //     { added, updated, removed }: any,
    //     origin: any,
    //   ) => {
    //     const changed = added.concat(updated, removed);
    //     const update = awarenessProtocol.encodeAwarenessUpdate(awareness!, changed);

    //     const enc = encoding.createEncoder();
    //     encoding.writeVarUint(enc, MSG_AWARENESS);
    //     encoding.writeVarUint8Array(enc, update);

    //     this.server
    //       .to(ROOM(docId))
    //       .emit('yjs:awareness', encoding.toUint8Array(enc));
    //   };

    //   doc.on('update', onDocUpdate);
    //   awareness.on('update', onAwarenessUpdate);

    //   this.attachedByDoc.set(docId, {
    //     doc,
    //     onUpdate: onDocUpdate,
    //     onAwareness: onAwarenessUpdate,
    //   });
    // }

    // Initial sync step 1 (to this client only)
    {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MSG_SYNC);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      syncProtocol.writeSyncStep1(enc, acquisition.doc);
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
  }

  async handleDisconnect(client: ClientSocket) {
    const docId = String(client.data.docId ?? '');
    if (!docId) return;

    await Promise.resolve(); // workaround

    this.docs.release(docId);

    // If room is empty, we can cleanup awareness/broadcasters
    const room = this.server.sockets.adapter.rooms.get(ROOM(docId));
    const roomSize: number = room ? room.size : 0;

    if (roomSize === 0) {
      const attached = this.attachedByDoc.get(docId);
      const session = this.docs.getSession(docId);
      if (attached && session) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        attached.doc.off('update', attached.onUpdate);
        (session.awareness as AwarenessNS.Awareness).off(
          'update',
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          attached.onAwareness,
        );
        this.attachedByDoc.delete(docId);
      }

      const awareness = this.awarenessByDoc.get(docId);
      if (awareness) {
        awareness.destroy();
        this.awarenessByDoc.delete(docId);
      }
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

      // IMPORTANT: pass origin as client to prevent echo confusion
      syncProtocol.readSyncMessage(dec, enc, acquisition.doc, client);

      // If response contains more than just the header, respond to sender only
      if (encoding.length(enc) > 1) {
        client.emit('yjs:sync', encoding.toUint8Array(enc));
      }
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
    await Promise.resolve();

    const { decoding } = await loadYjsProtocols();

    const awareness = this.awarenessByDoc.get(docId);
    if (!awareness) return;

    const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
    const dec = decoding.createDecoder(u8);

    const msgType = decoding.readVarUint(dec);
    if (msgType !== MSG_AWARENESS) return;

    const update = decoding.readVarUint8Array(dec);
    awarenessProtocol.applyAwarenessUpdate(awareness, update, client);
  }
}
