import { createZodDto } from 'nestjs-zod';
import { ChangePasswordSchema } from '@humanproxy/shared';

export class ChangePasswordDto extends createZodDto(ChangePasswordSchema) {}
