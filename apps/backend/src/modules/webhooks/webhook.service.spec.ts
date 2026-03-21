import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { WebhookService } from './webhook.service';

describe('WebhookService', () => {
  let service: WebhookService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [WebhookService],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
  });

  describe('dispatch', () => {
    it('should send POST request to callback URL', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ status: 200 });
      global.fetch = mockFetch;

      await service.dispatch(
        { url: 'https://example.com/hook', method: 'POST' },
        { message_id: 'm1' },
      );

      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/hook',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ message_id: 'm1' }),
        }),
      );
    });

    it('should not throw on fetch failure', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      await expect(
        service.dispatch(
          { url: 'https://example.com/hook', method: 'POST' },
          { data: 'test' },
        ),
      ).resolves.not.toThrow();
    });

    it('should include basic auth header', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ status: 200 });
      global.fetch = mockFetch;

      await service.dispatch(
        {
          url: 'https://example.com/hook',
          method: 'POST',
          auth: { type: 'basic', username: 'user', password: 'pass' },
        },
        { data: 'test' },
      );

      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = callArgs[1].headers as Record<string, string>;
      expect(headers['Authorization']).toBe(
        `Basic ${Buffer.from('user:pass').toString('base64')}`,
      );
    });

    it('should include bearer auth header', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ status: 200 });
      global.fetch = mockFetch;

      await service.dispatch(
        {
          url: 'https://example.com/hook',
          method: 'POST',
          auth: { type: 'bearer', token: 'my-token' },
        },
        { data: 'test' },
      );

      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = callArgs[1].headers as Record<string, string>;
      expect(headers['Authorization']).toBe('Bearer my-token');
    });

    it('should include custom headers', async () => {
      const mockFetch = jest.fn().mockResolvedValue({ status: 200 });
      global.fetch = mockFetch;

      await service.dispatch(
        {
          url: 'https://example.com/hook',
          method: 'POST',
          headers: { 'X-Custom': 'value' },
        },
        { data: 'test' },
      );

      const callArgs = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = callArgs[1].headers as Record<string, string>;
      expect(headers['X-Custom']).toBe('value');
    });
  });

  describe('URL validation (SSRF protection)', () => {
    it('should reject localhost URLs', async () => {
      await expect(
        service.dispatch(
          { url: 'http://localhost/hook', method: 'POST' },
          { data: 'test' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject 127.0.0.1 URLs', async () => {
      await expect(
        service.dispatch(
          { url: 'http://127.0.0.1/hook', method: 'POST' },
          { data: 'test' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject private IP ranges', async () => {
      await expect(
        service.dispatch(
          { url: 'http://192.168.1.1/hook', method: 'POST' },
          { data: 'test' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject AWS metadata endpoint', async () => {
      await expect(
        service.dispatch(
          { url: 'http://169.254.169.254/latest/meta-data/', method: 'GET' },
          { data: 'test' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid URLs', async () => {
      await expect(
        service.dispatch(
          { url: 'not-a-url', method: 'POST' },
          { data: 'test' },
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject non-http protocols', async () => {
      await expect(
        service.dispatch(
          { url: 'ftp://example.com/file', method: 'POST' },
          { data: 'test' },
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
