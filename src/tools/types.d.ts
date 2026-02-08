import * as Y from 'yjs';

export type ToolType = string;

export interface SnapshotPolicy {
  /**
   * Maximum number of updates before forcing a snapshot
   */
  maxUpdates: number;

  /**
   * Maximum time (ms) before forcing a snapshot
   */
  maxIntervalMs: number;
}

export interface AuthResult {
  docId: string;
  toolType: string;
}

interface AuthedWebSocket extends WebSocket {
  docId: string;
}

// export type YJS = {
//   AbsolutePosition: unknown;
//   AbstractConnector: unknown;
//   AbstractStruct: unknown;
//   AbstractType: unknown;
//   Array: unknown;
//   ContentAny: unknown;
//   ContentBinary: unknown;
//   ContentDeleted: unknown;
//   ContentDoc: unknown;
//   ContentEmbed: unknown;
//   ContentFormat: unknown;
//   ContentJSON: unknown;
//   ContentString: unknown;
//   ContentType: unknown;
//   Doc: unknown;
//   GC: unknown;
//   ID: unknown;
//   Item: unknown;
//   Map: unknown;
//   PermanentUserData: unknown;
//   RelativePosition: unknown;
//   Skip: unknown;
//   Snapshot: unknown;
//   Text: unknown;
//   Transaction: unknown;
//   UndoManager: unknown;
//   UpdateDecoderV1: unknown;
//   UpdateDecoderV2: unknown;
//   UpdateEncoderV1: unknown;
//   UpdateEncoderV2: unknown;
//   XmlElement: unknown;
//   XmlFragment: unknown;
//   XmlHook: unknown;
//   XmlText: unknown;
//   YArrayEvent: unknown;
//   YEvent: unknown;
//   YMapEvent: unknown;
//   YTextEvent: unknown;
//   YXmlEvent: unknown;
//   applyUpdate: unknown;
//   applyUpdateV2: unknown;
//   cleanupYTextFormatting: unknown;
//   compareIDs: unknown;
//   compareRelativePositions: unknown;
//   convertUpdateFormatV1ToV2: unknown;
//   convertUpdateFormatV2ToV1: unknown;
//   createAbsolutePositionFromRelativePosition: unknown;
//   createDeleteSet: unknown;
//   createDeleteSetFromStructStore: unknown;
//   createDocFromSnapshot: unknown;
//   createID: unknown;
//   createRelativePositionFromJSON: unknown;
//   createRelativePositionFromTypeIndex: unknown;
//   createSnapshot: unknown;
//   decodeRelativePosition: unknown;
//   decodeSnapshot: unknown;
//   decodeSnapshotV2: unknown;
// };

export interface ToolDefinition {
  /**
   * Unique tool identifier
   */
  type: ToolType;

  /**
   * Create a fresh authoritative document
   */
  initDocument(): Promise<Y.Doc>;

  /**
   * Optional domain validation
   * Must be pure and side-effect free
   */
  validate?(doc: Y.Doc): ValidationResult;

  /**
   * Optional compilation / export step
   */
  compile?(doc: Y.Doc): unknown;

  /**
   * Snapshot behavior tuning
   */
  snapshotPolicy: SnapshotPolicy;
}

export interface ValidationError {
  path: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

interface ActiveDocument {
  doc: Doc;
  toolType: string;
  refCount: number;
  lastAccessed: number;
  awareness: Awareness;

  seq: number;
  lastSnapshotSeq: number;
  lastSnapshotTime: number;

  // queue state
  chain: Promise<void>;
  pendingUpdates: number;
  destroy: () => void;
}

export type DocSession = {
  doc: Doc;
  awareness: awarenessProtocol.Awareness;
};
