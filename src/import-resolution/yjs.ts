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

function unwrap<T>(m: unknown): T {
  return ((m as { default: any }).default ?? m) as T;
}

type YjsProtocols = {
  encoding: typeof EncodingNS;
  decoding: typeof DecodingNS;
  sync: typeof SyncNS;
  awareness: typeof AwarenessNS.Awareness;
};

let cached: YjsProtocols;

export async function loadYjsProtocols(): Promise<YjsProtocols> {
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
    awareness: unwrap<typeof AwarenessNS>(awarenessMod).Awareness,
  };

  return cached;
}
