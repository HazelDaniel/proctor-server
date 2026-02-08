// Collaboration Layer: Document registry (seq tracking + snapshot policy + eviction)
import { Injectable } from '@nestjs/common';
import type { Doc } from 'yjs' with { 'resolution-mode': 'import' };
import { ToolRegistry } from 'src/tools/registry';
import type { ActiveDocument, DocSession } from 'src/tools/types';
import { ToolPersistenceService } from 'src/toolpersistence/toolpersistence.service';
import { loadYjsProtocols } from 'src/import-resolution/yjs';
import type * as AwarenessNS from 'y-protocols/awareness' with {
  'resolution-mode': 'import',
};

@Injectable()
export class DocumentRegistry {
  private readonly docs = new Map<string, ActiveDocument>();
  private readonly EVICTION_TIMEOUT_MS = 60_000;

  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly persistence: ToolPersistenceService,
  ) {}

  async acquire(docId: string, toolType: string): Promise<DocSession> {
    let entry: ActiveDocument | undefined = this.docs.get(docId);
    if (!entry) {
      entry = await this.loadOrCreate(docId, toolType);
      this.docs.set(docId, entry);
    }
    entry.refCount++;
    entry.lastAccessed = Date.now();

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    return { doc: entry?.doc, awareness: entry?.awareness } as DocSession;
  }

  getSession(docId: string): DocSession | null {
    const entry = this.docs.get(docId) as ActiveDocument;
    if (!entry) return null;
    return {
      doc: entry.doc as Doc,
      awareness: entry.awareness as AwarenessNS.Awareness,
    } as DocSession;
  }

  release(docId: string) {
    const entry = this.docs.get(docId);
    if (!entry) return;

    entry.refCount--;
    entry.lastAccessed = Date.now();
  }

  private shouldSnapshot(entry: ActiveDocument): boolean {
    const tool = this.toolRegistry.get(entry.toolType);
    const policy = tool.snapshotPolicy;
    const tooManyUpdates =
      entry.seq - entry.lastSnapshotSeq >= policy.maxUpdates;
    const tooMuchTime =
      Date.now() - entry.lastSnapshotTime >= policy.maxIntervalMs;

    return tooManyUpdates || tooMuchTime;
  }

  private async loadOrCreate(
    docId: string,
    toolType: string,
  ): Promise<ActiveDocument> {
    const tool = this.toolRegistry.get(toolType);
    // Try loading from persistence
    const loaded = await this.persistence.loadDocument(docId);

    let doc: Doc;
    let seq = 0;
    let lastSnapshotSeq = 0;
    const lastSnapshotTime = Date.now();
    const { awareness: awareness_ } = await loadYjsProtocols();

    if (loaded) {
      doc = loaded.doc;
      seq = loaded.seq;
      lastSnapshotSeq = seq;
    } else {
      doc = await tool.initDocument();
      await this.persistence.persistInitialSnapshot(docId, toolType, doc);
    }

    const awareness = new awareness_(doc);

    const entry: ActiveDocument = {
      doc,
      toolType,
      awareness,
      refCount: 0,
      lastAccessed: Date.now(),
      seq,
      lastSnapshotSeq,
      lastSnapshotTime,
      chain: Promise.resolve(),
      pendingUpdates: 0,
      destroy: () => {
        awareness.destroy();
        doc.destroy();
      },
    };

    doc.on('update', (update: Uint8Array) => {
      entry.pendingUpdates++;
      entry.chain = entry.chain
        .then(async () => {
          entry.seq += 1;
          await this.persistence.appendUpdate(docId, entry.seq, update);

          if (this.shouldSnapshot(entry)) {
            await this.persistence.createSnapshot(docId, entry.seq, doc);
            entry.lastSnapshotSeq = entry.seq;
            entry.lastSnapshotTime = Date.now();
          }

          entry.pendingUpdates--;
        })
        .catch((e) => {
          void e;
          entry.pendingUpdates = Math.max(0, entry.pendingUpdates - 1);
          // TODO: log this. Do not throw in event loop.
        });
    });

    return entry;
  }

  private async evictIdleDocs() {
    const now = Date.now();

    for (const [docId, entry] of this.docs) {
      if (entry.refCount > 0) continue;
      if (now - entry.lastAccessed < this.EVICTION_TIMEOUT_MS) continue;

      //  flush queued persistence writes (strict ordering guarantee)
      await entry.chain;

      //  final snapshot if dirty
      if (entry.seq > entry.lastSnapshotSeq) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        await this.persistence.createSnapshot(docId, entry.seq, entry.doc);
        entry.lastSnapshotSeq = entry.seq;
        entry.lastSnapshotTime = Date.now();
      }

      entry.destroy();
      this.docs.delete(docId);
    }
  }
}
