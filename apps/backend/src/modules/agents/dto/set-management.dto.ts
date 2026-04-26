import { createZodDto } from 'nestjs-zod';
import { SetManagementSchema } from '@placet/shared';

export class SetManagementDto extends createZodDto(SetManagementSchema) {}
