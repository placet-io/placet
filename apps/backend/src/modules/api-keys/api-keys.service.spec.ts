import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('ApiKeysService', () => {
  let service: ApiKeysService;
  let prisma: {
    apiKey: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      apiKey: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ApiKeysService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<ApiKeysService>(ApiKeysService);
  });

  describe('findAllByUser', () => {
    it('should return API keys for user', async () => {
      const keys = [{ id: 'k1', label: 'Default', keyPrefix: 'hp_abc1234' }];
      prisma.apiKey.findMany.mockResolvedValue(keys);
      expect(await service.findAllByUser('u1')).toEqual(keys);
    });
  });

  describe('create', () => {
    it('should create an API key with hp_ prefix', async () => {
      prisma.apiKey.create.mockImplementation(
        ({
          data,
        }: {
          data: {
            label: string;
            keyPrefix: string;
            keyHash: string;
            userId: string;
          };
        }) => {
          return Promise.resolve({
            id: 'k1',
            userId: 'u1',
            label: data.label,
            keyPrefix: data.keyPrefix,
            lastUsedAt: null,
            createdAt: new Date().toISOString(),
          });
        },
      );

      const result = await service.create('u1', 'My Key');
      expect(result.key).toMatch(/^hp_/);
      expect(result.label).toBe('My Key');
      expect(prisma.apiKey.create).toHaveBeenCalled();
    });

    it('should use "Default" label when none provided', async () => {
      prisma.apiKey.create.mockImplementation(
        ({
          data,
        }: {
          data: {
            label: string;
            keyPrefix: string;
            keyHash: string;
            userId: string;
          };
        }) => {
          return Promise.resolve({
            id: 'k1',
            userId: 'u1',
            label: data.label,
            keyPrefix: data.keyPrefix,
            lastUsedAt: null,
            createdAt: new Date().toISOString(),
          });
        },
      );

      const result = await service.create('u1');
      expect(result.label).toBe('Default');
    });
  });

  describe('remove', () => {
    it('should delete an API key', async () => {
      prisma.apiKey.findFirst.mockResolvedValue({ id: 'k1', userId: 'u1' });
      prisma.apiKey.delete.mockResolvedValue({});
      expect(await service.remove('k1', 'u1')).toEqual({ deleted: true });
    });

    it('should throw NotFoundException if key not found', async () => {
      prisma.apiKey.findFirst.mockResolvedValue(null);
      await expect(service.remove('k1', 'u1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should not delete another users key', async () => {
      prisma.apiKey.findFirst.mockResolvedValue(null); // findFirst with userId filter returns null
      await expect(service.remove('k1', 'other-user')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('rotate', () => {
    it('should atomically rotate an API key and return new key', async () => {
      prisma.apiKey.findFirst.mockResolvedValue({
        id: 'k1',
        userId: 'u1',
      });
      prisma.apiKey.update.mockImplementation(
        ({ data }: { data: Record<string, unknown> }) => {
          return Promise.resolve({
            id: 'k1',
            userId: 'u1',
            label: 'Default',
            keyPrefix: data.keyPrefix,
            lastUsedAt: null,
            createdAt: new Date().toISOString(),
          });
        },
      );

      const result = await service.rotate('k1', 'u1');
      expect(result.key).toMatch(/^hp_/);
      expect(result.id).toBe('k1');
      expect(prisma.apiKey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'k1' },
          data: expect.objectContaining({
            keyHash: expect.any(String),
            keyPrefix: expect.any(String),
            lastUsedAt: null,
          }),
        }),
      );
    });

    it('should throw NotFoundException if key not found', async () => {
      prisma.apiKey.findFirst.mockResolvedValue(null);
      await expect(service.rotate('k1', 'u1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should not rotate another users key', async () => {
      prisma.apiKey.findFirst.mockResolvedValue(null);
      await expect(service.rotate('k1', 'other-user')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reset lastUsedAt to null on rotation', async () => {
      prisma.apiKey.findFirst.mockResolvedValue({
        id: 'k1',
        userId: 'u1',
      });
      prisma.apiKey.update.mockResolvedValue({
        id: 'k1',
        userId: 'u1',
        label: 'Default',
        keyPrefix: 'hp_new1234',
        lastUsedAt: null,
        createdAt: new Date().toISOString(),
      });

      await service.rotate('k1', 'u1');
      expect(prisma.apiKey.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ lastUsedAt: null }),
        }),
      );
    });
  });
});
