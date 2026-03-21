import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@humanproxy.local' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'changeme' })
  @IsString()
  @MinLength(1)
  password: string;
}
