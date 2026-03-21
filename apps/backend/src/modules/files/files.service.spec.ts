import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FilesService } from './files.service';
import { PrismaService } from '../../prisma/prisma.service';

// Mock the AWS SDK modules
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: jest.fn().mockImplementation(() => ({})),
  PutObjectCommand: jest.fn(),
  GetObjectCommand: jest.fn(),
}));
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://presigned-url.com/file'),
}));

describe('FilesService', () => {
  let service: FilesService;
  let prisma: {
    agent: { findMany: jest.Mock };
    attachment: { findMany: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      agent: { findMany: jest.fn() },
      attachment: { findMany: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest
              .fn()
              .mockImplementation((key: string, def: string) => def),
          },
        },
      ],
    }).compile();

    service = module.get<FilesService>(FilesService);
  });

  describe('presignUpload', () => {
    it('should return presigned URL and storage key', async () => {
      const result = await service.presignUpload('file.txt', 'text/plain');
      expect(result.url).toBe('https://presigned-url.com/file');
      expect(result.storageKey).toMatch(/^uploads\//);
    });
  });

  describe('presignDownload', () => {
    it('should return presigned download URL', async () => {
      const result = await service.presignDownload('uploads/123-file.txt');
      expect(result.url).toBe('https://presigned-url.com/file');
    });
  });

  describe('findAllByUser', () => {
    it('should return attachments for user agents', async () => {
      prisma.agent.findMany.mockResolvedValue([{ id: 'a1' }]);
      prisma.attachment.findMany.mockResolvedValue([{ id: 'att1' }]);

      const result = await service.findAllByUser('u1', {});
      expect(result).toHaveLength(1);
    });
  });

  describe('findAllByAgent', () => {
    it('should return attachments for agent', async () => {
      prisma.attachment.findMany.mockResolvedValue([{ id: 'att1' }]);
      const result = await service.findAllByAgent('a1');
      expect(result).toHaveLength(1);
    });
  });
});
