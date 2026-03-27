import { createZodDto } from 'nestjs-zod';
import { CreateApiKeySchema } from '@placet/shared';

export class CreateApiKeyDto extends createZodDto(CreateApiKeySchema) {}
