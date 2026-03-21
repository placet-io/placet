import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

export class UpdatePreferencesDto {
  @ApiPropertyOptional({
    example: 'dark',
    enum: ['light', 'dark', 'system'],
  })
  @IsOptional()
  @IsIn(['light', 'dark', 'system'])
  theme?: string;
}
