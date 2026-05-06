import { createZodDto } from 'nestjs-zod';
import { AppendStatusEventSchema } from '@placet/shared';

export class AppendStatusEventDto extends createZodDto(
  AppendStatusEventSchema,
) {}
