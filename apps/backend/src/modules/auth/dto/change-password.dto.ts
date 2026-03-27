import { createZodDto } from 'nestjs-zod';
import { ChangePasswordSchema } from '@placet/shared';

export class ChangePasswordDto extends createZodDto(ChangePasswordSchema) {}
