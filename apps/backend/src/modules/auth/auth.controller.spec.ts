import { Test, TestingModule } from '@nestjs/testing';
import type { FastifyReply } from 'fastify';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: { login: jest.Mock };

  beforeEach(async () => {
    authService = {
      login: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('login', () => {
    it('should set cookie and return user', async () => {
      const mockResult = {
        accessToken: 'jwt-token',
        user: { id: 'u1', email: 'a@b.com', displayName: 'A', role: 'owner' },
      };
      authService.login.mockResolvedValue(mockResult);

      const res = { setCookie: jest.fn() } as unknown as FastifyReply;
      const result = await controller.login(
        { email: 'a@b.com', password: 'pw' },
        res,
      );

      expect(
        (res as unknown as { setCookie: jest.Mock }).setCookie,
      ).toHaveBeenCalledWith(
        'access_token',
        'jwt-token',
        expect.objectContaining({ httpOnly: true, path: '/' }),
      );
      expect(result).toEqual({ user: mockResult.user });
    });
  });

  describe('logout', () => {
    it('should clear cookie', () => {
      const res = { clearCookie: jest.fn() } as unknown as FastifyReply;
      const result = controller.logout(res);

      expect(
        (res as unknown as { clearCookie: jest.Mock }).clearCookie,
      ).toHaveBeenCalledWith('access_token', {
        path: '/',
      });
      expect(result).toEqual({ message: 'Logged out' });
    });
  });
});
