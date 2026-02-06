import {
  WebSocketGateway,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import WebSocket from 'ws';
import type { Doc } from 'yjs' with { 'resolution-mode': 'import' };

import type * as EncodingNS from 'lib0/encoding' with {
  'resolution-mode': 'import',
};
import type * as DecodingNS from 'lib0/decoding' with {
  'resolution-mode': 'import',
};
import type * as SyncNS from 'y-protocols/sync' with {
  'resolution-mode': 'import',
};
import type * as AwarenessNS from 'y-protocols/awareness' with {
  'resolution-mode': 'import',
};
import type { AuthResult } from './types';

import { DocumentRegistry } from 'src/document-registry/document-registry.service';

export function authenticate(client: WebSocket): AuthResult {
  void client;
  // extract from query, headers, subprotocol, etc.
  return { docId: '...', toolType: 'schema-design' };
}

function unwrap<T>(m: unknown): T {
  return ((m as { default: any }).default ?? m) as T;
}

type YjsProtocols = {
  encoding: typeof EncodingNS;
  decoding: typeof DecodingNS;
  sync: typeof SyncNS;
  awareness: typeof AwarenessNS;
};

let cached: YjsProtocols;

async function loadYjsProtocols(): Promise<YjsProtocols> {
  if (cached) return cached;

  const [encodingMod, decodingMod, syncMod, awarenessMod] = await Promise.all([
    import('lib0/encoding'),
    import('lib0/decoding'),
    import('y-protocols/sync'),
    import('y-protocols/awareness'),
  ]);

  cached = {
    encoding: unwrap<typeof EncodingNS>(encodingMod),
    decoding: unwrap<typeof DecodingNS>(decodingMod),
    sync: unwrap<typeof SyncNS>(syncMod),
    awareness: unwrap<typeof AwarenessNS>(awarenessMod),
  };

  return cached;
}

@WebSocketGateway({ path: '/collab' })
export class YjsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(private readonly registry: DocumentRegistry) {}

  async handleConnection(client: WebSocket) {
    const { docId, toolType } = authenticate(client);
    const doc = await this.registry.acquire(docId, toolType);
    const { encoding, sync } = await loadYjsProtocols();
    const encoder = encoding.createEncoder();

    sync.writeSyncStep1(encoder, doc);
    client.send(encoding.toUint8Array(encoder));

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    client.on('message', async (data: Buffer) => {
      await this.handleMessage(client, docId, doc, data);
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
