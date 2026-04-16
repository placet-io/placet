import { createZodDto } from 'nestjs-zod';
import { UpdateAgentCommandsSchema } from '@placet/shared';

export class UpdateCommandsDto extends createZodDto(
  UpdateAgentCommandsSchema,
) {}
