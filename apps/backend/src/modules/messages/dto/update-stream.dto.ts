import { createZodDto } from 'nestjs-zod';
import { UpdateAgentStreamSchema } from '@placet/shared';

export class UpdateStreamDto extends createZodDto(UpdateAgentStreamSchema) {}
