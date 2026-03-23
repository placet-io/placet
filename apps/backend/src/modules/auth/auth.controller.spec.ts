import { Test, TestingModule } from '@nestjs/testing';
import type { FastifyReply } from 'fastify';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import type { RequestWithUser } from '../../common/types';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    login: jest.Mock;
    refresh: jest.Mock;
    changePassword: jest.Mock;
  };

  const mockUser = {
    id: 'u1',
    email: 'a@b.com',
    displayName: 'A',
    role: 'owner',
  };

  beforeEach(async () => {
    authService = {
      login: jest.fn(),
      refresh: jest.fn(),
      changePassword: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('login', () => {
    it('should set cookie and return user', async () => {
      const mockResult = { accessToken: 'jwt-token', user: mockUser };
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
      expect(result).toEqual({ user: mockUser });
    });
  });

  describe('refresh', () => {
    it('should set new cookie and return user', async () => {
      const mockResult = { accessToken: 'new-jwt-token', user: mockUser };
      authService.refresh.mockResolvedValue(mockResult);

      const req = { user: mockUser } as unknown as RequestWithUser;
      const res = { setCookie: jest.fn() } as unknown as FastifyReply;
      const result = await controller.refresh(req, res);

      expect(
        (res as unknown as { setCookie: jest.Mock }).setCookie,
      ).toHaveBeenCalledWith(
        'access_token',
        'new-jwt-token',
        expect.objectContaining({ httpOnly: true, path: '/', maxAge: 604800 }),
      );
      expect(result).toEqual({ user: mockUser });
    });

    it('should call authService.refresh with correct payload', async () => {
      authService.refresh.mockResolvedValue({
        accessToken: 'tok',
        user: mockUser,
      });

      const req = { user: mockUser } as unknown as RequestWithUser;
      const res = { setCookie: jest.fn() } as unknown as FastifyReply;
      await controller.refresh(req, res);

      expect(authService.refresh).toHaveBeenCalledWith({
        sub: 'u1',
        email: 'a@b.com',
        role: 'owner',
      });
    });
  });

  describe('me', () => {
    it('should return current user info including mustChangePassword', () => {
      const req = {
        user: { ...mockUser, mustChangePassword: true },
      } as unknown as RequestWithUser;
      const result = controller.me(req);

      expect(result).toEqual({
        user: {
          id: 'u1',
          email: 'a@b.com',
          displayName: 'A',
          role: 'owner',
          mustChangePassword: true,
        },
      });
    });

    it('should handle user without displayName', () => {
      const req = {
        user: { id: 'u2', email: 'b@c.com', role: 'member' },
      } as unknown as RequestWithUser;
      const result = controller.me(req);

      expect(result).toEqual({
        user: {
          id: 'u2',
          email: 'b@c.com',
          displayName: undefined,
          role: 'member',
          mustChangePassword: undefined,
        },
      });
    });
  });

  describe('logout', () => {
    it('should clear cookie and return message', () => {
      const res = { clearCookie: jest.fn() } as unknown as FastifyReply;
      const result = controller.logout(res);

      expect(
        (res as unknown as { clearCookie: jest.Mock }).clearCookie,
      ).toHaveBeenCalledWith('access_token', { path: '/' });
      expect(result).toEqual({ message: 'Logged out' });
    });
  });

  describe('changePassword', () => {
    it('should call authService.changePassword with correct args', async () => {
      authService.changePassword.mockResolvedValue({
        message: 'Password changed successfully',
      });

      const req = {
        user: { id: 'u1', email: 'a@b.com', role: 'owner' },
      } as unknown as RequestWithUser;
      const result = await controller.changePassword(req, {
        currentPassword: 'oldpw',
        newPassword: 'newpw123',
      });

      expect(authService.changePassword).toHaveBeenCalledWith(
        'u1',
        'oldpw',
        'newpw123',
      );
      expect(result).toEqual({ message: 'Password changed successfully' });
    });
  });
});
