import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EventsGateway } from '../gateway/events.gateway';
import { WebhookService } from '../webhooks/webhook.service';

describe('MessagesService', () => {
  let service: MessagesService;
  let prisma: {
    message: {
      create: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    agent: { findFirst: jest.Mock; findMany: jest.Mock };
  };
  let events: { emitToChannel: jest.Mock };
  let webhooks: { dispatch: jest.Mock };

  beforeEach(async () => {
    prisma = {
      message: {
        create: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      agent: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
      },
    };
    events = { emitToChannel: jest.fn() };
    webhooks = { dispatch: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: PrismaService, useValue: prisma },
        { provide: EventsGateway, useValue: events },
        { provide: WebhookService, useValue: webhooks },
      ],
    }).compile();

    service = module.get<MessagesService>(MessagesService);
  });

  describe('createFromAgent', () => {
    it('should create message and emit event', async () => {
      const msg = { id: 'm1', channelId: 'a1', text: 'hello', attachments: [] };
      prisma.message.create.mockResolvedValue(msg);

      const result = await service.createFromAgent('a1', { text: 'hello' });

      expect(result).toEqual(msg);
      expect(events.emitToChannel).toHaveBeenCalledWith(
        'a1',
        'message:created',
        msg,
      );
    });
  });

  describe('findByAgent', () => {
    it('should return paginated messages', async () => {
      const messages = [{ id: 'm1' }, { id: 'm2' }];
      prisma.message.findMany.mockResolvedValue(messages);

      const result = await service.findByAgent('a1', { limit: 50 });
      expect(result.data).toEqual(messages);
    });
  });

  describe('findOneByAgent', () => {
    it('should return message if found', async () => {
      const msg = { id: 'm1', channelId: 'a1' };
      prisma.message.findFirst.mockResolvedValue(msg);
      expect(await service.findOneByAgent('m1', 'a1')).toEqual(msg);
    });

    it('should throw NotFoundException if not found', async () => {
      prisma.message.findFirst.mockResolvedValue(null);
      await expect(service.findOneByAgent('x', 'a1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('deleteByAgent', () => {
    it('should delete the message', async () => {
      prisma.message.findFirst.mockResolvedValue({ id: 'm1' });
      prisma.message.delete.mockResolvedValue({});

      const result = await service.deleteByAgent('m1', 'a1');
      expect(result).toEqual({ deleted: true });
    });
  });

  describe('findByChannel', () => {
    it('should throw ForbiddenException if not owner', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);
      await expect(service.findByChannel('a1', 'u1', {})).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return messages for owned channel', async () => {
      prisma.agent.findFirst.mockResolvedValue({ id: 'a1' });
      prisma.message.findMany.mockResolvedValue([{ id: 'm1' }]);

      const result = await service.findByChannel('a1', 'u1', {});
      expect(result.data).toHaveLength(1);
    });
  });

  describe('createFromUser', () => {
    it('should throw ForbiddenException if agent not owned', async () => {
      prisma.agent.findFirst.mockResolvedValue(null);
      await expect(service.createFromUser('u1', 'a1', 'hi')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should create message and emit event', async () => {
      prisma.agent.findFirst.mockResolvedValue({ id: 'a1' });
      const msg = { id: 'm1', channelId: 'a1', text: 'hi', attachments: [] };
      prisma.message.create.mockResolvedValue(msg);

      const result = await service.createFromUser('u1', 'a1', 'hi');
      expect(result).toEqual(msg);
      expect(events.emitToChannel).toHaveBeenCalled();
    });
  });

  describe('getPendingReviewsByAgent', () => {
    it('should return pending reviews for agent', async () => {
      const reviews = [
        { id: 'm1', review: { status: 'pending', type: 'approval' } },
      ];
      prisma.message.findMany.mockResolvedValue(reviews);

      const result = await service.getPendingReviewsByAgent('a1');
      expect(result).toEqual(reviews);
      expect(prisma.message.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            channelId: 'a1',
          }) as unknown,
        }),
      );
    });

    it('should return empty array if no pending reviews', async () => {
      prisma.message.findMany.mockResolvedValue([]);
      const result = await service.getPendingReviewsByAgent('a1');
      expect(result).toEqual([]);
    });
  });

  describe('getReviewByAgent', () => {
    it('should return message with review', async () => {
      const msg = {
        id: 'm1',
        channelId: 'a1',
        review: { status: 'pending', type: 'approval' },
      };
      prisma.message.findFirst.mockResolvedValue(msg);

      const result = await service.getReviewByAgent('m1', 'a1');
      expect(result).toEqual(msg);
    });

    it('should throw NotFoundException if message not found', async () => {
      prisma.message.findFirst.mockResolvedValue(null);
      await expect(service.getReviewByAgent('x', 'a1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if message has no review', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: 'm1',
        channelId: 'a1',
        review: null,
      });
      await expect(service.getReviewByAgent('m1', 'a1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('waitForReviewResponse', () => {
    it('should return immediately if review already completed', async () => {
      const msg = {
        id: 'm1',
        channelId: 'a1',
        review: { status: 'completed', type: 'approval' },
      };
      prisma.message.findFirst.mockResolvedValue(msg);

      const result = await service.waitForReviewResponse('m1', 'a1', 5000);
      expect(result.status).toBe('completed');
      expect(result.message).toEqual(msg);
    });

    it('should return completed when review is resolved during poll', async () => {
      const pendingMsg = {
        id: 'm1',
        channelId: 'a1',
        review: { status: 'pending', type: 'approval' },
      };
      const completedMsg = {
        id: 'm1',
        channelId: 'a1',
        review: {
          status: 'completed',
          type: 'approval',
          response: { approved: true },
        },
      };

      // First call (getReviewByAgent) returns pending
      // Second call (poll) returns completed
      prisma.message.findFirst
        .mockResolvedValueOnce(pendingMsg)
        .mockResolvedValueOnce(completedMsg);

      const result = await service.waitForReviewResponse('m1', 'a1', 5000);
      expect(result.status).toBe('completed');
      expect(result.message).toEqual(completedMsg);
    });

    it('should return timeout when review is not resolved', async () => {
      const pendingMsg = {
        id: 'm1',
        channelId: 'a1',
        review: { status: 'pending', type: 'approval' },
      };
      prisma.message.findFirst.mockResolvedValue(pendingMsg);

      // Use very short timeout to avoid slow test
      const result = await service.waitForReviewResponse('m1', 'a1', 100);
      expect(result.status).toBe('timeout');
    });

    it('should throw NotFoundException if message not found', async () => {
      prisma.message.findFirst.mockResolvedValue(null);
      await expect(
        service.waitForReviewResponse('x', 'a1', 1000),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('respondToReview', () => {
    it('should throw NotFoundException if message not found', async () => {
      prisma.message.findUnique.mockResolvedValue(null);
      await expect(
        service.respondToReview('m1', 'u1', { response: {} }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if not agent owner', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'm1',
        review: { status: 'pending' },
        agent: { ownerId: 'other-user' },
      });
      await expect(
        service.respondToReview('m1', 'u1', { response: {} }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should update review and emit event', async () => {
      prisma.message.findUnique.mockResolvedValue({
        id: 'm1',
        channelId: 'a1',
        review: { status: 'pending', type: 'approval' },
        agent: { ownerId: 'u1' },
      });
      prisma.message.update.mockResolvedValue({
        id: 'm1',
        review: { status: 'completed' },
      });

      await service.respondToReview('m1', 'u1', {
        response: { approved: true },
      });

      expect(prisma.message.update).toHaveBeenCalled();
      expect(events.emitToChannel).toHaveBeenCalledWith(
        'a1',
        'review:responded',
        expect.anything(),
      );
    });
  });
});
