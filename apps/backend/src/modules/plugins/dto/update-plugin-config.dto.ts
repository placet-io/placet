import { createZodDto } from 'nestjs-zod';
import { UpdatePluginConfigSchema } from '@humanproxy/shared';

export class UpdatePluginConfigDto extends createZodDto(
  UpdatePluginConfigSchema,
) {}
