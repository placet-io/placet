import { createZodDto } from 'nestjs-zod';
import { PingStatusSchema } from '@placet/shared';

export class PingStatusDto extends createZodDto(PingStatusSchema) {}
