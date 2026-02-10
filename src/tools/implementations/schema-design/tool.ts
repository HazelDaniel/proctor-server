import type {
  ToolDefinition,
  ValidationResult,
  ValidationError,
} from '../../types';
import type { Doc } from 'yjs' with { 'resolution-mode': 'import' };

type JsonObj = Record<string, unknown>;

function isObj(v: unknown): v is JsonObj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function asStr(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length ? v : null;
}

function pushErr(errors: ValidationError[], path: string, message: string) {
  errors.push({ path, message });
}
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

    validate(doc): ValidationResult {
      const errors: ValidationError[] = [];

      const tables = doc.getMap('tables');
      const keys = doc.getMap('keys');
      const references = doc.getMap('references');
      const compositions = doc.getMap('compositions');
      const meta = doc.getMap('meta');

      // meta schemaVersion
      const schemaVersion = meta.get('schemaVersion');
      if (typeof schemaVersion !== 'number') {
        pushErr(errors, 'meta.schemaVersion', 'schemaVersion must be a number');
      }

      // Basic sanity: maps exist (getMap always returns a map, but keep for safety)
      if (!tables) pushErr(errors, 'tables', 'tables map missing');
      if (!keys) pushErr(errors, 'keys', 'keys map missing');
      if (!references) pushErr(errors, 'references', 'references map missing');
      if (!compositions)
        pushErr(errors, 'compositions', 'compositions map missing');

      // Collect tables + check uniqueness by name
      const tableIds = new Set<string>();
      const tableNameToId = new Map<string, string>();

      tables.forEach((value, id) => {
        if (!asStr(id)) {
          pushErr(
            errors,
            `tables.${String(id)}`,
            'table id must be a non-empty string',
          );
          return;
        }
        tableIds.add(id);

        if (!isObj(value)) {
          pushErr(errors, `tables.${id}`, 'table value must be an object');
          return;
        }

        const name = asStr(value.name);
        if (!name) {
          pushErr(
            errors,
            `tables.${id}.name`,
            'table name must be a non-empty string',
          );
          return;
        }

        const existing = tableNameToId.get(name.toLowerCase());
        if (existing && existing !== id) {
          pushErr(
            errors,
            `tables.${id}.name`,
            `duplicate table name '${name}' (already used by ${existing})`,
          );
        } else {
          tableNameToId.set(name.toLowerCase(), id);
        }
      });

      // Collect keys + validate tableId linkage
      const keyIds = new Set<string>();
      keys.forEach((value, id) => {
        if (!asStr(id)) {
          pushErr(
            errors,
            `keys.${String(id)}`,
            'key id must be a non-empty string',
          );
          return;
        }
        keyIds.add(id);

        if (!isObj(value)) {
          pushErr(errors, `keys.${id}`, 'key value must be an object');
          return;
        }

        const tableId = asStr(value.tableId);
        if (!tableId) {
          pushErr(
            errors,
            `keys.${id}.tableId`,
            'key.tableId must be a non-empty string',
          );
        } else if (!tableIds.has(tableId)) {
          pushErr(
            errors,
            `keys.${id}.tableId`,
            `tableId '${tableId}' does not exist`,
          );
        }

        const name = asStr(value.name);
        if (!name) {
          pushErr(
            errors,
            `keys.${id}.name`,
            'key name must be a non-empty string',
          );
        }
      });

      // Validate references
      references.forEach((value, id) => {
        const refId = asStr(id) ?? String(id);

        if (!isObj(value)) {
          pushErr(
            errors,
            `references.${refId}`,
            'reference value must be an object',
          );
          return;
        }

        const fromTableId = asStr(value.fromTableId);
        const toTableId = asStr(value.toTableId);

        if (!fromTableId)
          pushErr(
            errors,
            `references.${refId}.fromTableId`,
            'fromTableId must be a non-empty string',
          );
        else if (!tableIds.has(fromTableId))
          pushErr(
            errors,
            `references.${refId}.fromTableId`,
            `table '${fromTableId}' does not exist`,
          );

        if (!toTableId)
          pushErr(
            errors,
            `references.${refId}.toTableId`,
            'toTableId must be a non-empty string',
          );
        else if (!tableIds.has(toTableId))
          pushErr(
            errors,
            `references.${refId}.toTableId`,
            `table '${toTableId}' does not exist`,
          );

        const fromKeyId = asStr(value.fromKeyId);
        if (fromKeyId && !keyIds.has(fromKeyId)) {
          pushErr(
            errors,
            `references.${refId}.fromKeyId`,
            `key '${fromKeyId}' does not exist`,
          );
        }

        const toKeyId = asStr(value.toKeyId);
        if (toKeyId && !keyIds.has(toKeyId)) {
          pushErr(
            errors,
            `references.${refId}.toKeyId`,
            `key '${toKeyId}' does not exist`,
          );
        }
      });

      // Validate compositions (composite keys etc.)
      compositions.forEach((value, id) => {
        const compId = asStr(id) ?? String(id);

        if (!isObj(value)) {
          pushErr(
            errors,
            `compositions.${compId}`,
            'composition value must be an object',
          );
          return;
        }

        const keyIdsVal = value.keyIds;
        if (
          !Array.isArray(keyIdsVal) ||
          keyIdsVal.some((k) => typeof k !== 'string' || !k)
        ) {
          pushErr(
            errors,
            `compositions.${compId}.keyIds`,
            'keyIds must be an array of non-empty strings',
          );
          return;
        }

        for (let i = 0; i < keyIdsVal.length; i++) {
          const k = keyIdsVal[i] as string;
          if (!keyIds.has(k)) {
            pushErr(
              errors,
              `compositions.${compId}.keyIds[${i}]`,
              `key '${k}' does not exist`,
            );
          }
        }
      });

      return { valid: errors.length === 0, errors };
    },

    snapshotPolicy: {
      maxUpdates: 100,
      maxIntervalMs: 30_000,
    },
  };
}
