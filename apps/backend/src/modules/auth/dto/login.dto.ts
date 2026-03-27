import { createZodDto } from 'nestjs-zod';
import { LoginSchema } from '@placet/shared';

export class LoginDto extends createZodDto(LoginSchema) {}
