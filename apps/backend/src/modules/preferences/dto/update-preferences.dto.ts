import { createZodDto } from 'nestjs-zod';
import { UpdatePreferencesSchema } from '@humanproxy/shared';

export class UpdatePreferencesDto extends createZodDto(
  UpdatePreferencesSchema,
) {}
