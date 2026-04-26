import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AgentsService } from './agents.service';
import { AgentRosterEvents } from './agent-roster-events';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../providers/s3.service';

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
      providers: [
        AgentsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: S3Service,
          useValue: {
            upload: jest.fn().mockResolvedValue(undefined),
            getStream: jest.fn().mockResolvedValue({}),
            delete: jest.fn().mockResolvedValue(undefined),
            deleteMany: jest.fn().mockResolvedValue(undefined),
          },
        },
        AgentRosterEvents,
      ],
    }).compile();

    service = module.get<AgentsService>(AgentsService);
  });

  describe('findAllByOwner', () => {
    it('should return agents for owner', async () => {
      const agents = [
        {
          id: 'a1',
          name: 'Bot',
          messages: [],
          channelReads: [],
          _count: { messages: 0 },
        },
      ];
      prisma.agent.findMany.mockResolvedValue(agents);
      const result = await service.findAllByOwner('u1');
      expect(result).toEqual([
        expect.objectContaining({ id: 'a1', name: 'Bot', unreadCount: 0 }),
      ]);
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
    it('should create agent without API key', async () => {
      prisma.agent.create.mockResolvedValue({
        id: 'a1',
        name: 'Bot',
        webhookUrl: null,
      });

      const result = await service.create('u1', { name: 'Bot' });
      expect(result.id).toBe('a1');
      expect(result.name).toBe('Bot');
      expect(prisma.agent.create).toHaveBeenCalled();
    });

    it('should pass webhookUrl when provided', async () => {
      prisma.agent.create.mockResolvedValue({
        id: 'a1',
        name: 'Bot',
        webhookUrl: 'https://example.com/hook',
      });

      const result = await service.create('u1', {
        name: 'Bot',
        webhookUrl: 'https://example.com/hook',
      });
      expect(result.webhookUrl).toBe('https://example.com/hook');
    });
  });

  describe('update', () => {
    it('should update an agent', async () => {
      prisma.agent.findFirst.mockResolvedValue({ id: 'a1' });
      prisma.agent.update.mockResolvedValue({ id: 'a1', name: 'Updated' });

      const result = await service.update('a1', 'u1', { name: 'Updated' });
      expect(result.name).toBe('Updated');
    });

    it('should update webhookUrl', async () => {
      prisma.agent.findFirst.mockResolvedValue({ id: 'a1' });
      prisma.agent.update.mockResolvedValue({
        id: 'a1',
        webhookUrl: 'https://new.example.com/hook',
      });

      const result = await service.update('a1', 'u1', {
        webhookUrl: 'https://new.example.com/hook',
      });
      expect(result.webhookUrl).toBe('https://new.example.com/hook');
    });

    it('should update webhookHeaders and webhookAuth', async () => {
      prisma.agent.findFirst.mockResolvedValue({ id: 'a1' });
      const headers = { 'X-Custom': 'value' };
      const auth = { username: 'user', password: 'pass' };
      prisma.agent.update.mockResolvedValue({
        id: 'a1',
        webhookHeaders: headers,
        webhookAuth: auth,
      });

      const result = await service.update('a1', 'u1', {
        webhookHeaders: headers,
        webhookAuth: auth,
      });
      expect(result.webhookHeaders).toEqual(headers);
      expect(result.webhookAuth).toEqual({ username: 'user', password: '***' });
      expect(prisma.agent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            webhookHeaders: headers,
            webhookAuth: auth,
          }) as Record<string, unknown>,
        }),
      );
    });

    it('should clear webhookHeaders when set to null', async () => {
      prisma.agent.findFirst.mockResolvedValue({ id: 'a1' });
      prisma.agent.update.mockResolvedValue({
        id: 'a1',
        webhookHeaders: null,
        webhookAuth: null,
      });

      const result = await service.update('a1', 'u1', {
        webhookHeaders: null,
        webhookAuth: null,
      });
      expect(result.webhookHeaders).toBeNull();
      expect(result.webhookAuth).toBeNull();
    });

    it('should throw NotFoundException for non-existent agent', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);
      await expect(
        service.update('x', 'u1', { name: 'Updated' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('should delete an agent', async () => {
      prisma.agent.findFirst.mockResolvedValue({ id: 'a1' });
      prisma.agent.delete.mockResolvedValue({});
      expect(await service.remove('a1', 'u1')).toEqual({ deleted: true });
    });
  });
});
