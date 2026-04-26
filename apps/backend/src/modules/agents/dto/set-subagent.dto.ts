import { createZodDto } from 'nestjs-zod';
import { SetSubagentSchema } from '@placet/shared';

export class SetSubagentDto extends createZodDto(SetSubagentSchema) {}
