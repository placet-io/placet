import { createZodDto } from 'nestjs-zod';
import { RespondReviewSchema } from '@humanproxy/shared';

export class RespondReviewDto extends createZodDto(RespondReviewSchema) {}
