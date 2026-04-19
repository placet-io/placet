import { createZodDto } from 'nestjs-zod';
import { SetTagSchema } from '@placet/shared';

export class SetTagDto extends createZodDto(SetTagSchema) {}
