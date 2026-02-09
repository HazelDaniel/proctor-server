// Collaboration Layer: Persistence service (fixed and() usage + dynamic yjs import)
import { Injectable } from '@nestjs/common';
import { and, lt } from 'drizzle-orm';
import { lte } from 'drizzle-orm';
import { eq, gt, desc } from 'drizzle-orm';
import { db } from 'src/db/db.provider';
import {
  documentSnapshots,
  documentUpdates,
  documents,
} from 'src/db/drivers/drizzle/schema';
import type { Doc } from 'yjs' with { 'resolution-mode': 'import' };

@Injectable()
export class ToolPersistenceService {
  private readonly SNAPSHOT_COMPACTION_THRESHOLD: number = 5;

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

    await this.compactAfterSnapshot(
      docId,
      seq,
      this.SNAPSHOT_COMPACTION_THRESHOLD,
    );
  }

  /**
   * After writing a snapshot at sequence S for docId:
      delete all document_updates with seq <= S (they’re covered by the snapshot)
      keep only the latest N snapshots (configurable), delete older ones
   */
  async compactAfterSnapshot(
    docId: string,
    snapshotSeq: number,
    keepSnapshots = 5,
  ) {
    await db.transaction(async (tx) => {
      await tx
        .delete(documentUpdates)
        .where(
          and(
            eq(documentUpdates.docId, docId),
            lte(documentUpdates.seq, snapshotSeq),
          ),
        );

      const keep = await tx
        .select({ seq: documentSnapshots.seq })
        .from(documentSnapshots)
        .where(eq(documentSnapshots.docId, docId))
        .orderBy(desc(documentSnapshots.seq))
        .limit(keepSnapshots);

      if (keep.length < keepSnapshots) return;

      const cutoffSeq = keep[keep.length - 1].seq;

      await tx
        .delete(documentSnapshots)
        .where(
          and(
            eq(documentSnapshots.docId, docId),
            lt(documentSnapshots.seq, cutoffSeq),
          ),
        );
    });
  }
}
