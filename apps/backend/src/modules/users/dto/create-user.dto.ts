import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'user@humanproxy.local' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Jane Doe' })
  @IsString()
  @MinLength(1)
  displayName: string;

  @ApiProperty({ example: 'securepassword' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({ example: 'member', enum: ['owner', 'member'] })
  @IsOptional()
  @IsIn(['owner', 'member'])
  role?: string;
}
