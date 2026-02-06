import { Injectable } from '@nestjs/common';
import { eq, gt, desc } from 'drizzle-orm';
import { db } from './db.provider';
import {
  documentSnapshots,
  documentUpdates,
  documents,
} from './drivers/drizzle/schema';
import type { Doc } from 'yjs' with { 'resolution-mode': 'import' };

@Injectable()
export class DbService {
  async loadDocument(docId: string): Promise<{ doc: Doc; seq: number } | null> {
    const snapshot = await db
      .select()
      .from(documentSnapshots)
      .where(eq(documentSnapshots.docId, docId))
      .orderBy(desc(documentSnapshots.seq))
      .limit(1);

    if (snapshot.length === 0) {
      return null;
    }

    const [{ snapshot: binary, seq }] = snapshot;

    const { Doc, applyUpdate } = await import('yjs');
    const doc: Doc = new Doc();
    applyUpdate(doc, binary);

    const updates = await db
      .select()
      .from(documentUpdates)
      .where(gt(documentUpdates.seq, seq) && eq(documentUpdates.docId, docId))
      .orderBy(documentUpdates.seq);

    for (const row of updates) {
      applyUpdate(doc, row.update);
    }

    return { doc, seq: updates.at(-1)?.seq ?? seq };
  }

  async persistInitialSnapshot(docId: string, toolType: string, doc: Doc) {
    const { encodeStateAsUpdate } = await import('yjs');
    const snapshot = encodeStateAsUpdate(doc);

    await db.transaction(async (tx) => {
      await tx.insert(documents).values({
        id: docId,
        toolType,
      });

      await tx.insert(documentSnapshots).values({
        docId,
        seq: 0,
        snapshot: Buffer.from(snapshot),
      });
    });
  }

  async appendUpdate(docId: string, seq: number, update: Uint8Array) {
    await db.insert(documentUpdates).values({
      docId,
      seq,
      update: Buffer.from(update),
    });
  }

  async createSnapshot(docId: string, seq: number, doc: Doc) {
    const { encodeStateAsUpdate } = await import('yjs');
    const snapshot = encodeStateAsUpdate(doc);

    await db.insert(documentSnapshots).values({
      docId,
      seq,
      snapshot: Buffer.from(snapshot),
    });
  }
}
