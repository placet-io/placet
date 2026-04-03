import { createZodDto } from 'nestjs-zod';
import { SetWebhookSchema, DeleteWebhookSchema } from '@placet/shared';

export class SetWebhookDto extends createZodDto(SetWebhookSchema) {}

export class DeleteWebhookDto extends createZodDto(DeleteWebhookSchema) {}
