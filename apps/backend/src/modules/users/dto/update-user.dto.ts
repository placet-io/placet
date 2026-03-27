import { createZodDto } from 'nestjs-zod';
import { UpdateUserSchema } from '@placet/shared';

export class UpdateUserDto extends createZodDto(UpdateUserSchema) {}
