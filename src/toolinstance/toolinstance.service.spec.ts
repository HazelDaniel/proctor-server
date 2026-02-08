import { Test, TestingModule } from '@nestjs/testing';
import { ToolInstanceService } from './toolinstance.service';

describe('ToolinstanceService', () => {
  let service: ToolInstanceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ToolInstanceService],
    }).compile();

    service = module.get<ToolInstanceService>(ToolInstanceService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
