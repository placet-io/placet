import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class PresignUploadDto {
  @ApiProperty({ example: 'report.pdf' })
  @IsString()
  @MinLength(1)
  filename: string;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  @MinLength(1)
  mimeType: string;
}
