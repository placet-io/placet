import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateMessageDto {
  @ApiPropertyOptional({ example: 'Please review this deployment.' })
  @IsOptional()
  @IsString()
  text?: string;

  @ApiPropertyOptional({
    example: 'info',
    enum: ['info', 'success', 'warning', 'error'],
  })
  @IsOptional()
  @IsIn(['info', 'success', 'warning', 'error'])
  status?: string;

  @ApiPropertyOptional({
    example: {
      type: '@uax/approval',
      payload: { options: [{ id: 'approve', label: 'Approve' }] },
      callback: { url: 'https://example.com/webhook', method: 'POST' },
    },
  })
  @IsOptional()
  @IsObject()
  review?: Record<string, unknown>;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}
