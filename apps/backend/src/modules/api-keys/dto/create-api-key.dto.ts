import { createZodDto } from 'nestjs-zod';
import { CreateApiKeySchema } from '@humanproxy/shared';

export class CreateApiKeyDto extends createZodDto(CreateApiKeySchema) {}
