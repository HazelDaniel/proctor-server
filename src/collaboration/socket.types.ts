import type { DefaultEventsMap, Socket } from 'socket.io';

export type SocketData = {
  docId: string;
  toolType: string;
  instanceId: string;
  userId: string;
};

export type DocBroadcastState = {
  flushTimer: NodeJS.Timeout | null;
  pendingSyncUpdates: Uint8Array[];
  pendingAwarenessUpdates: Uint8Array[];
};

export type ClientSocket = Socket<
  DefaultEventsMap, // events client -> server
  DefaultEventsMap, // events server -> client
  DefaultEventsMap, // inter-server events (usually DefaultEventsMap)
  SocketData
>;
