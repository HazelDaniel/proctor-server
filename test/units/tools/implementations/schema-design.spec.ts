import { SchemaDesignTool } from '../../../../src/tools/implementations/schema-design/tool';

describe('SchemaDesignTool.validate', () => {
  test('valid empty baseline passes (maps exist)', async () => {
    const tool = new SchemaDesignTool();
    const doc = await tool.definition.initDocument();

    const res = tool.definition.validate!(doc);
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  test('duplicate table names fails', async () => {
    const tool = new SchemaDesignTool();
    const doc = await tool.definition.initDocument();

    const tables = doc.getMap('tables');
    tables.set('t1', { name: 'Users' });
    tables.set('t2', { name: 'users' });

    const res = tool.definition.validate!(doc);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.path.includes('tables.t2.name'))).toBe(
      true,
    );
  });

  test('reference to missing table fails', async () => {
    const tool = new SchemaDesignTool();
    const doc = await tool.definition.initDocument();

    doc.getMap('tables').set('t1', { name: 'A' });

    doc.getMap('references').set('r1', {
      fromTableId: 't1',
      toTableId: 'missing',
    });

    const res = tool.definition.validate!(doc);
    expect(res.valid).toBe(false);
    expect(
      res.errors.some((e) => e.path.includes('references.r1.toTableId')),
    ).toBe(true);
  });
});
