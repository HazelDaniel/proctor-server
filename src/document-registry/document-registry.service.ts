import { Injectable } from '@nestjs/common';
import type { Doc } from 'yjs' with { 'resolution-mode': 'import' };
import { ToolRegistry } from 'src/tools/registry';
import type { ActiveDocument } from 'src/tools/types';
import { DbService } from 'src/db/db.service';

@Injectable()
export class DocumentRegistry {
  private readonly docs = new Map<string, ActiveDocument>();

  constructor(
    private readonly toolRegistry: ToolRegistry,
    private readonly persistence: DbService,
  ) {}

  async acquire(docId: string, toolType: string): Promise<Doc> {
    let entry = this.docs.get(docId);

    if (!entry) {
      entry = await this.loadOrCreate(docId, toolType);
      this.docs.set(docId, entry);
    }

    entry.refCount++;
    entry.lastAccessed = Date.now();

    return entry.doc as Doc;
  }

  release(docId: string) {
    const entry = this.docs.get(docId);
    if (!entry) return;

    entry.refCount--;
    entry.lastAccessed = Date.now();
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

    if (loaded) {
      doc = loaded.doc;
      seq = loaded.seq;
    } else {
      // Async tool initialization (your change)
      doc = await tool.initDocument();
      await this.persistence.persistInitialSnapshot(docId, toolType, doc);
    }

    return {
      doc,
      toolType,
      refCount: 0,
      lastAccessed: Date.now(),
      seq,
    };
  }
}
