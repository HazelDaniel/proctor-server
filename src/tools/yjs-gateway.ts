import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import WebSocket from 'ws';
import type { Doc } from 'yjs' with { 'resolution-mode': 'import' };
import type { AuthResult } from './types';
import { DocumentRegistry } from 'src/document-registry/document-registry.service';
import { loadYjsProtocols } from 'src/import-resolution/yjs';

export function authenticate(client: WebSocket): AuthResult {
  void client;
  // extract from query, headers, subprotocol, etc.
  return { docId: '...', toolType: 'schema-design' };
}

@WebSocketGateway({ path: '/collab' })
export class YjsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(private readonly registry: DocumentRegistry) {}

  async handleConnection(client: WebSocket) {
    const { docId, toolType } = authenticate(client);
    const acquisition = await this.registry.acquire(docId, toolType);
    const { encoding, sync } = await loadYjsProtocols();
    const encoder = encoding.createEncoder();

    sync.writeSyncStep1(encoder, acquisition.doc as Doc);
    client.send(encoding.toUint8Array(encoder));

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    client.on('message', async (data: Buffer) => {
      await this.handleMessage(client, docId, acquisition.doc as Doc, data);
    });
  }

  handleDisconnect(client: WebSocket) {
    const { docId } = client as AuthResult & WebSocket;

    this.registry.release(docId);
  }

  private async handleMessage(
    client: WebSocket,
    docId: string,
    doc: Doc,
    data: Buffer,
  ) {
    const { encoding, decoding, sync: syncProtocol } = await loadYjsProtocols();
    const decoder = decoding.createDecoder(data);
    const encoder = encoding.createEncoder();
    const messageType = decoding.readVarUint(decoder);

    if (messageType === syncProtocol.messageYjsSyncStep1) {
      syncProtocol.readSyncMessage(decoder, encoder, doc, null);
      if (encoding.length(encoder) > 1) {
        client.send(encoding.toUint8Array(encoder));
      }
    }
  }
}
