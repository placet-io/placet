import { ApiProperty } from '@nestjs/swagger';
import { IsObject } from 'class-validator';

export class RespondReviewDto {
  @ApiProperty({
    example: { selectedOption: 'approve', comment: 'Looks good!' },
  })
  @IsObject()
  response: Record<string, unknown>;
}
