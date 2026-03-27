import { createZodDto } from 'nestjs-zod';
import { UpdateAgentSchema } from '@placet/shared';

export class UpdateAgentDto extends createZodDto(UpdateAgentSchema) {}
