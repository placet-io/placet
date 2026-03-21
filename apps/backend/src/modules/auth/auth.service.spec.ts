import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: { findUnique: jest.Mock; create: jest.Mock } };
  let jwt: { sign: jest.Mock };
  let config: { get: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
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
      });

      const result = await service.login('test@example.com', 'password123');

      expect(result.accessToken).toBe('signed-token');
      expect(result.user.email).toBe('test@example.com');
      expect(jwt.sign).toHaveBeenCalledWith({
        sub: 'u1',
        email: 'test@example.com',
        role: 'owner',
      });
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

  describe('onModuleInit (seedInitialUser)', () => {
    it('should create initial user if none exists', async () => {
      config.get.mockReturnValue('admin@test.com');
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({});

      await service.onModuleInit();

      expect(prisma.user.create).toHaveBeenCalled();
    });

    it('should skip creation if user already exists', async () => {
      config.get.mockReturnValue('admin@test.com');
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });

      await service.onModuleInit();

      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });
});
