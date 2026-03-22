import { createZodDto } from 'nestjs-zod';
import { UpdateAgentSchema } from '@humanproxy/shared';

export class UpdateAgentDto extends createZodDto(UpdateAgentSchema) {}
