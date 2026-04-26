import { Test, TestingModule } from '@nestjs/testing';
import { PreferencesService } from './preferences.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PreferencesService', () => {
  let service: PreferencesService;
  let prisma: {
    userPreferences: { findUnique: jest.Mock; upsert: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      userPreferences: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreferencesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<PreferencesService>(PreferencesService);
  });

  describe('get', () => {
    it('should return prefs if found', async () => {
      const prefs = { userId: 'u1', theme: 'dark' };
      prisma.userPreferences.findUnique.mockResolvedValue(prefs);
      expect(await service.get('u1')).toEqual(prefs);
    });

    it('should return default if not found', async () => {
      prisma.userPreferences.findUnique.mockResolvedValue(null);
      const result = await service.get('u1');
      expect(result).toEqual({
        userId: 'u1',
        theme: 'system',
        managementDashboard: false,
      });
    });
  });

  describe('update', () => {
    it('should upsert preferences', async () => {
      prisma.userPreferences.upsert.mockResolvedValue({
        userId: 'u1',
        theme: 'dark',
      });

      const result = await service.update('u1', { theme: 'dark' });
      expect(result.theme).toBe('dark');
      expect(prisma.userPreferences.upsert).toHaveBeenCalled();
    });
  });
});
