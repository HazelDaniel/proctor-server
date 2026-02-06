import type { ToolDefinition } from '../../types.js';
import type { Doc } from 'yjs' with { 'resolution-mode': 'import' };

export class SchemaDesignTool {
  readonly definition: ToolDefinition = {
    type: 'schema-design',

    async initDocument() {
      const doc: Doc = new (await import('yjs')).Doc();

      doc.getMap('tables');
      doc.getMap('keys');
      doc.getMap('references');
      doc.getMap('compositions');
      doc.getMap('meta').set('schemaVersion', 1);

      return doc;
    },

    validate(doc) {
      void doc;
      return { valid: true, errors: [] };
    },

    snapshotPolicy: {
      maxUpdates: 100,
      maxIntervalMs: 30_000,
    },
  };
}
