import { createZodDto } from 'nestjs-zod';
import { CreateAgentSchema } from '@humanproxy/shared';

export class CreateAgentDto extends createZodDto(CreateAgentSchema) {}
