import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class CreateUserMessageDto {
  @ApiProperty({ example: 'agent-uuid-here' })
  @IsString()
  @MinLength(1)
  channelId: string;

  @ApiProperty({ example: 'Hello, please review this.' })
  @IsString()
  @MinLength(1)
  text: string;
}
