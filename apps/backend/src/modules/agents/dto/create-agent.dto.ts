import { createZodDto } from 'nestjs-zod';
import { CreateAgentSchema } from '@placet/shared';

export class CreateAgentDto extends createZodDto(CreateAgentSchema) {}
