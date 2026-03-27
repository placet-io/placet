import { createZodDto } from 'nestjs-zod';
import { CreateAgentMessageSchema } from '@placet/shared';

export class CreateMessageDto extends createZodDto(CreateAgentMessageSchema) {}
