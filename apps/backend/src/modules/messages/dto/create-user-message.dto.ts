import { createZodDto } from 'nestjs-zod';
import { CreateUserMessageSchema } from '@placet/shared';

export class CreateUserMessageDto extends createZodDto(
  CreateUserMessageSchema,
) {}
