import { createZodDto } from 'nestjs-zod';
import { CreateUserMessageSchema } from '@humanproxy/shared';

export class CreateUserMessageDto extends createZodDto(
  CreateUserMessageSchema,
) {}
