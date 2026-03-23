import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; create: jest.Mock; update: jest.Mock };
  };
  let jwt: { sign: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    };
    jwt = { sign: jest.fn().mockReturnValue('signed-token') };
    config = { get: jest.fn().mockReturnValue('test-value') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('login', () => {
    it('should return accessToken and user on valid credentials', async () => {
      const hash = await bcrypt.hash('password123', 12);
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'test@example.com',
        displayName: 'Test',
        passwordHash: hash,
        role: 'owner',
        mustChangePassword: false,
      });

      const result = await service.login('test@example.com', 'password123');

      expect(result.accessToken).toBe('signed-token');
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.mustChangePassword).toBe(false);
      expect(jwt.sign).toHaveBeenCalledWith({
        sub: 'u1',
        email: 'test@example.com',
        role: 'owner',
      });
    });

    it('should return mustChangePassword: true when set on user', async () => {
      const hash = await bcrypt.hash('password123', 12);
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'test@example.com',
        displayName: 'Test',
        passwordHash: hash,
        role: 'owner',
        mustChangePassword: true,
      });

      const result = await service.login('test@example.com', 'password123');
      expect(result.user.mustChangePassword).toBe(true);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.login('x@x.com', 'pw')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException on wrong password', async () => {
      const hash = await bcrypt.hash('correct', 12);
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'test@example.com',
        passwordHash: hash,
        role: 'owner',
      });
      await expect(service.login('test@example.com', 'wrong')).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('validateJwtPayload', () => {
    it('should return user if found', async () => {
      const user = { id: 'u1', email: 'a@b.com' };
      prisma.user.findUnique.mockResolvedValue(user);

      const result = await service.validateJwtPayload({
        sub: 'u1',
        email: 'a@b.com',
        role: 'owner',
      });
      expect(result).toEqual(user);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.validateJwtPayload({
          sub: 'u1',
          email: 'a@b.com',
          role: 'owner',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    it('should return new accessToken and user for valid payload', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'test@example.com',
        displayName: 'Test',
        role: 'owner',
      });

      const result = await service.refresh({
        sub: 'u1',
        email: 'test@example.com',
        role: 'owner',
      });

      expect(result.accessToken).toBe('signed-token');
      expect(result.user.id).toBe('u1');
      expect(result.user.email).toBe('test@example.com');
      expect(result.user.displayName).toBe('Test');
      expect(jwt.sign).toHaveBeenCalledWith({
        sub: 'u1',
        email: 'test@example.com',
        role: 'owner',
      });
    });

    it('should throw UnauthorizedException if user no longer exists', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(
        service.refresh({
          sub: 'deleted-user',
          email: 'deleted@example.com',
          role: 'owner',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reflect updated user role in new token', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'test@example.com',
        displayName: 'Test',
        role: 'member',
      });

      const result = await service.refresh({
        sub: 'u1',
        email: 'test@example.com',
        role: 'owner', // old role in token
      });

      expect(result.user.role).toBe('member');
      expect(jwt.sign).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'member' }),
      );
    });
  });

  describe('changePassword', () => {
    it('should change password and set mustChangePassword to false', async () => {
      const hash = await bcrypt.hash('oldpass', 12);
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        email: 'test@example.com',
        passwordHash: hash,
        mustChangePassword: true,
      });
      prisma.user.update.mockResolvedValue({});

      const result = await service.changePassword('u1', 'oldpass', 'newpass');

      expect(result).toEqual({ message: 'Password changed successfully' });
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: expect.objectContaining({
            passwordHash: expect.any(String),
            mustChangePassword: false,
          }),
        }),
      );
    });

    it('should throw UnauthorizedException if user not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.changePassword('u1', 'old', 'new')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if current password is wrong', async () => {
      const hash = await bcrypt.hash('correct', 12);
      prisma.user.findUnique.mockResolvedValue({
        id: 'u1',
        passwordHash: hash,
      });
      await expect(
        service.changePassword('u1', 'wrong', 'newpass'),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('onModuleInit (seedInitialUser)', () => {
    it('should create initial user with mustChangePassword if none exists', async () => {
      config.get.mockReturnValue('admin@test.com');
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({});

      await service.onModuleInit();

      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mustChangePassword: true,
          }),
        }),
      );
    });

    it('should skip creation if user already exists', async () => {
      config.get.mockReturnValue('admin@test.com');
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });

      await service.onModuleInit();

      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });
});
