import { Test, TestingModule } from '@nestjs/testing';
import { ToolpersistenceService } from './toolpersistence.service';

describe('ToolpersistenceService', () => {
  let service: ToolpersistenceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ToolpersistenceService],
    }).compile();

    service = module.get<ToolpersistenceService>(ToolpersistenceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
