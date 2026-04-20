import { Test, TestingModule } from '@nestjs/testing';
import { OAuthRelayService } from './oauth-relay.service';

describe('OAuthRelayService', () => {
  let service: OAuthRelayService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [OAuthRelayService],
    }).compile();

    service = module.get<OAuthRelayService>(OAuthRelayService);
  });

  describe('register + consume', () => {
    it('should register and consume a flow state', () => {
      service.register('state-abc', 'channel-123', 'github');

      const result = service.consume('state-abc');
      expect(result).toEqual({
        channelId: 'channel-123',
        provider: 'github',
        createdAt: expect.any(Number),
      });
    });

    it('should return null for unknown state', () => {
      expect(service.consume('unknown-state')).toBeNull();
    });

    it('should consume state only once (single-use)', () => {
      service.register('state-once', 'ch-1', 'provider');

      expect(service.consume('state-once')).not.toBeNull();
      expect(service.consume('state-once')).toBeNull();
    });

    it('should return null for expired state', () => {
      service.register('state-expired', 'ch-2', 'provider');

      // Manually expire it by manipulating the internal map
      const pending = (service as any).pending as Map<string, any>;
      const entry = pending.get('state-expired')!;
      entry.createdAt = Date.now() - 11 * 60 * 1000; // 11 min ago

      expect(service.consume('state-expired')).toBeNull();
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries', () => {
      service.register('fresh', 'ch-a', 'p');
      service.register('stale', 'ch-b', 'p');

      const pending = (service as any).pending as Map<string, any>;
      const staleEntry = pending.get('stale')!;
      staleEntry.createdAt = Date.now() - 11 * 60 * 1000;

      service.cleanup();

      expect(service.consume('fresh')).not.toBeNull();
      expect(service.consume('stale')).toBeNull();
    });
  });
});
