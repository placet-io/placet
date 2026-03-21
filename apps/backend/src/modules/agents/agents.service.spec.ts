import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AgentsService', () => {
  let service: AgentsService;
  let prisma: {
    agent: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      agent: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [AgentsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<AgentsService>(AgentsService);
  });

  describe('findAllByOwner', () => {
    it('should return agents for owner', async () => {
      const agents = [{ id: 'a1', name: 'Bot' }];
      prisma.agent.findMany.mockResolvedValue(agents);
      expect(await service.findAllByOwner('u1')).toEqual(agents);
    });
  });

  describe('findById', () => {
    it('should return agent if found', async () => {
      const agent = { id: 'a1', name: 'Bot' };
      prisma.agent.findFirst.mockResolvedValue(agent);
      expect(await service.findById('a1', 'u1')).toEqual(agent);
    });

    it('should throw NotFoundException if not found', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);
      await expect(service.findById('x', 'u1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('create', () => {
    it('should create agent with hp_ prefixed API key', async () => {
      prisma.agent.create.mockResolvedValue({
        id: 'a1',
        name: 'Bot',
        apiKeyPrefix: 'hp_abc12345',
      });

      const result = await service.create('u1', { name: 'Bot' });
      expect(result.apiKey).toMatch(/^hp_/);
      expect(prisma.agent.create).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should update an agent', async () => {
      prisma.agent.findFirst.mockResolvedValue({ id: 'a1' });
      prisma.agent.update.mockResolvedValue({ id: 'a1', name: 'Updated' });

      const result = await service.update('a1', 'u1', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });
  });

  describe('remove', () => {
    it('should delete an agent', async () => {
      prisma.agent.findFirst.mockResolvedValue({ id: 'a1' });
      prisma.agent.delete.mockResolvedValue({});
      expect(await service.remove('a1', 'u1')).toEqual({ deleted: true });
    });
  });

  describe('rotateKey', () => {
    it('should generate new API key', async () => {
      prisma.agent.findFirst.mockResolvedValue({ id: 'a1' });
      prisma.agent.update.mockResolvedValue({});

      const result = await service.rotateKey('a1', 'u1');
      expect(result.apiKey).toMatch(/^hp_/);
      expect(result.apiKeyPrefix).toBeDefined();
    });
  });
});
