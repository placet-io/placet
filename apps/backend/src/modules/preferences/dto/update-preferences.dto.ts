import { createZodDto } from 'nestjs-zod';
import { UpdatePreferencesSchema } from '@placet/shared';

export class UpdatePreferencesDto extends createZodDto(
  UpdatePreferencesSchema,
) {}
