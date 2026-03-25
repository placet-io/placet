import { createZodDto } from 'nestjs-zod';
import { PingStatusSchema } from '@humanproxy/shared';

export class PingStatusDto extends createZodDto(PingStatusSchema) {}
