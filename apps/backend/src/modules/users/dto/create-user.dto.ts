import { createZodDto } from 'nestjs-zod';
import { CreateUserSchema } from '@placet/shared';

export class CreateUserDto extends createZodDto(CreateUserSchema) {}
