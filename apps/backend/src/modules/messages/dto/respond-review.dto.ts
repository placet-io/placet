import { createZodDto } from 'nestjs-zod';
import { RespondReviewSchema } from '@placet/shared';

export class RespondReviewDto extends createZodDto(RespondReviewSchema) {}
