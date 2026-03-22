import { createZodDto } from 'nestjs-zod';
import { LoginSchema } from '@humanproxy/shared';

export class LoginDto extends createZodDto(LoginSchema) {}
