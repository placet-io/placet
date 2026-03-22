import { createZodDto } from 'nestjs-zod';
import { CreateAgentMessageSchema } from '@humanproxy/shared';

export class CreateMessageDto extends createZodDto(CreateAgentMessageSchema) {}
