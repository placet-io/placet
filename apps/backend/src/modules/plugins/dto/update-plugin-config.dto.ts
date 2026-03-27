import { createZodDto } from 'nestjs-zod';
import { UpdatePluginConfigSchema } from '@placet/shared';

export class UpdatePluginConfigDto extends createZodDto(
  UpdatePluginConfigSchema,
) {}
