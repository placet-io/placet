import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { UsersService } from './users.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('UsersService', () => {
  let service: UsersService;
  let prisma: {
    user: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  describe('findAll', () => {
    it('should return all users', async () => {
      const users = [{ id: 'u1', email: 'a@b.com' }];
      prisma.user.findMany.mockResolvedValue(users);
      expect(await service.findAll()).toEqual(users);
    });
  });

  describe('findById', () => {
    it('should return a user by id', async () => {
      const user = { id: 'u1', email: 'a@b.com' };
      prisma.user.findUnique.mockResolvedValue(user);
      expect(await service.findById('u1')).toEqual(user);
    });

    it('should throw NotFoundException if not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.findById('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('should create a new user', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'u1',
        email: 'new@test.com',
        displayName: 'New',
        role: 'member',
      });

      const result = await service.create({
        email: 'new@test.com',
        displayName: 'New',
        password: 'secret',
      });
      expect(result.email).toBe('new@test.com');
      expect(prisma.user.create).toHaveBeenCalledWith(
        expect.objectContaining<Record<string, unknown>>({
          data: expect.objectContaining<Record<string, unknown>>({
            mustChangePassword: true,
          }) as unknown,
        }),
      );
    });

    it('should throw ConflictException on duplicate email', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      await expect(
        service.create({
          email: 'dup@test.com',
          displayName: 'Dup',
          password: 'pw',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('update', () => {
    it('should update a user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.user.update.mockResolvedValue({
        id: 'u1',
        displayName: 'Updated',
      });

      const result = await service.update('u1', { displayName: 'Updated' });
      expect(result.displayName).toBe('Updated');
    });

    it('should throw NotFoundException if user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.update('x', { displayName: 'No' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('should delete a user', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
      prisma.user.delete.mockResolvedValue({});
      expect(await service.remove('u1')).toEqual({ deleted: true });
    });

    it('should throw NotFoundException if not found', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(service.remove('x')).rejects.toThrow(NotFoundException);
    });
  });
});
