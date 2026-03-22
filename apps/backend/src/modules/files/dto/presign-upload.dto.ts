import { createZodDto } from 'nestjs-zod';
import { PresignUploadSchema } from '@humanproxy/shared';

export class PresignUploadDto extends createZodDto(PresignUploadSchema) {}
