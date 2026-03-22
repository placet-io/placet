import { createZodDto } from 'nestjs-zod';
import { UpdateUserSchema } from '@humanproxy/shared';

export class UpdateUserDto extends createZodDto(UpdateUserSchema) {}
