import { Test, TestingModule } from '@nestjs/testing';
import { DocumentRegistry } from '../../src/document-registry/document-registry.service.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { ToolPersistenceService } from '../../src/toolpersistence/toolpersistence.service.js';
import { SchemaDesignTool } from '../../src/tools/implementations/schema-design/tool.js';
import * as Y from 'yjs';

describe('Document Eviction Logic', () => {
  let moduleRef: TestingModule;
  let registry: DocumentRegistry;
  let toolRegistry: ToolRegistry;

  // Mock persistence
  const mockPersistence = {
    loadDocument: jest.fn().mockResolvedValue(null),
    persistInitialSnapshot: jest.fn().mockResolvedValue(undefined),
    appendUpdate: jest.fn().mockResolvedValue(undefined),
    createSnapshot: jest.fn().mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        DocumentRegistry,
        ToolRegistry,
        SchemaDesignTool, // Register explicit tool
        {
          provide: ToolPersistenceService,
          useValue: mockPersistence,
        },
      ],
    }).compile();

    registry = moduleRef.get(DocumentRegistry);
    toolRegistry = moduleRef.get(ToolRegistry);
    const schemaTool = moduleRef.get(SchemaDesignTool);
    toolRegistry.register(schemaTool.definition);
  });

  afterAll(async () => {
    await moduleRef.close();
  });

  test('should evict idle documents after timeout', async () => {
    const docId = 'eviction-test-doc';
    const toolType = 'schema-design';

    // 1. Acquire document
    await registry.acquire(docId, toolType);
    let session = registry.getSession(docId);
    expect(session).toBeDefined();

    // 2. Release document (refCount -> 0)
    registry.release(docId);

    // 3. Immediately check - should still be there (timeout not passed)
    // We mock Date.now so we can control "time elapsed"
    const realDateNow = Date.now;
    let fakeTime = 1000000;
    global.Date.now = jest.fn(() => fakeTime);

    // Force "start time" for the doc to be "now"
    // Actually, lastAccessed was set during release() which used real Date.now or the mocked one?
    // Let's re-acquire and release with mocked time to be sure.
    
    await registry.acquire(docId, toolType);
    registry.release(docId); // lastAccessed = 1000000

    // 4. Try evicting immediately - should fail (diff < 60000)
    fakeTime += 5000; // +5s
    await registry.evictIdleDocs();
    session = registry.getSession(docId);
    expect(session).toBeDefined(); // Still there

    // 5. Advance time > 60s
    fakeTime += 60000; // +60s
    await registry.evictIdleDocs();

    // 6. Should be gone
    session = registry.getSession(docId);
    expect(session).toBeNull();

    // Restore Date.now
    global.Date.now = realDateNow;
  });
});
