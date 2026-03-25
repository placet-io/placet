import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { FilesService } from './files.service';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../providers/s3.service';

describe('FilesService', () => {
  let service: FilesService;
  let prisma: {
    agent: { findMany: jest.Mock };
    attachment: { findMany: jest.Mock; create: jest.Mock };
    message: { create: jest.Mock };
  };
  let s3: {
    upload: jest.Mock;
    getStream: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      agent: { findMany: jest.fn() },
      attachment: { findMany: jest.fn(), create: jest.fn() },
      message: { create: jest.fn() },
    };

    s3 = {
      upload: jest.fn().mockResolvedValue(undefined),
      getStream: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FilesService,
        { provide: PrismaService, useValue: prisma },
        { provide: S3Service, useValue: s3 },
        {
          provide: JwtService,
          useValue: { sign: jest.fn(), verify: jest.fn() },
        },
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

  describe('uploadFile', () => {
    it('should upload to S3 and create message + attachment', async () => {
      const mockMessage = { id: 'msg1' };
      const mockAttachment = {
        id: 'att1',
        filename: 'file.txt',
        storageKey: 'uploads/123-file.txt',
      };
      prisma.message.create.mockResolvedValue(mockMessage);
      prisma.attachment.create.mockResolvedValue(mockAttachment);

      const result = await service.uploadFile(
        Buffer.from('hello'),
        'file.txt',
        'text/plain',
        'channel1',
      );

      expect(prisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining<Record<string, unknown>>({
          data: expect.objectContaining<Record<string, unknown>>({
            channelId: 'channel1',
          }),
        }),
      );
      expect(prisma.attachment.create).toHaveBeenCalledWith(
        expect.objectContaining<Record<string, unknown>>({
          data: expect.objectContaining<Record<string, unknown>>({
            messageId: 'msg1',
            filename: 'file.txt',
            mimeType: 'text/plain',
          }),
        }),
      );
      expect(result).toEqual(mockAttachment);
    });
  });

  describe('findAllByUser', () => {
    it('should return attachments for user agents', async () => {
      prisma.agent.findMany.mockResolvedValue([{ id: 'a1' }]);
      prisma.attachment.findMany.mockResolvedValue([{ id: 'att1' }]);

      const result = await service.findAllByUser('u1', {});
      expect(result.data).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
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
