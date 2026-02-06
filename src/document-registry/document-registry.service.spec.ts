import { Test, TestingModule } from '@nestjs/testing';
import { DocumentRegistryService } from './document-registry.service';

describe('DocumentRegistryService', () => {
  let service: DocumentRegistryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DocumentRegistryService],
    }).compile();

    service = module.get<DocumentRegistryService>(DocumentRegistryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
