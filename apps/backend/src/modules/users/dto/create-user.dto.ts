import { createZodDto } from 'nestjs-zod';
import { CreateUserSchema } from '@humanproxy/shared';

export class CreateUserDto extends createZodDto(CreateUserSchema) {}
