import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { LogsService } from './logs.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('LogsService', () => {
  let service: LogsService;
  let prisma: {
    apiLog: { findMany: jest.Mock; findFirst: jest.Mock; create: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      apiLog: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [LogsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<LogsService>(LogsService);
  });

  describe('findAll', () => {
    it('should return paginated logs', async () => {
      const logs = [{ id: 'l1' }];
      prisma.apiLog.findMany.mockResolvedValue(logs);

      const result = await service.findAll('u1', {});
      expect(result.data).toEqual(logs);
    });

    it('should apply filters', async () => {
      prisma.apiLog.findMany.mockResolvedValue([]);

      await service.findAll('u1', {
        agentId: 'a1',
        direction: 'inbound',
        limit: 10,
      });

      expect(prisma.apiLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'u1',
            agentId: 'a1',
            direction: 'inbound',
          }) as unknown,
          take: 10,
        }),
      );
    });
  });

  describe('findOne', () => {
    it('should return a log', async () => {
      const log = { id: 'l1' };
      prisma.apiLog.findFirst.mockResolvedValue(log);
      expect(await service.findOne('l1', 'u1')).toEqual(log);
    });

    it('should throw NotFoundException if not found', async () => {
      prisma.apiLog.findFirst.mockResolvedValue(null);
      await expect(service.findOne('x', 'u1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create a log entry', async () => {
      prisma.apiLog.create.mockResolvedValue({ id: 'l1' });

      const result = await service.create({
        userId: 'u1',
        method: 'GET',
        path: '/api/v1/messages',
        statusCode: 200,
        durationMs: 42,
        direction: 'inbound',
      });
      expect(result.id).toBe('l1');
    });
  });
});
