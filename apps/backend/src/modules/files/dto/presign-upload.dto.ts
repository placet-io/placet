import { createZodDto } from 'nestjs-zod';
import { PresignUploadSchema } from '@placet/shared';

export class PresignUploadDto extends createZodDto(PresignUploadSchema) {}
