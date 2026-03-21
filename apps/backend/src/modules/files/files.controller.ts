import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestWithUser } from '../../common/types';
import { FilesService } from './files.service';
import { PresignUploadDto } from './dto/presign-upload.dto';

@ApiTags('Files')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/files')
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Get()
  @ApiOperation({ summary: 'List all files across chats' })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filter by MIME type',
  })
  @ApiQuery({
    name: 'agent',
    required: false,
    description: 'Filter by agent ID',
  })
  findAll(
    @Req() req: RequestWithUser,
    @Query('type') type?: string,
    @Query('agent') agentId?: string,
  ) {
    return this.filesService.findAllByUser(req.user.id, { type, agentId });
  }

  @Post('presign-upload')
  @ApiOperation({ summary: 'Get presigned upload URL' })
  presignUpload(@Body() dto: PresignUploadDto) {
    return this.filesService.presignUpload(dto.filename, dto.mimeType);
  }

  @Get(':id/presign-download')
  @ApiOperation({ summary: 'Get presigned download URL' })
  presignDownload(@Param('id') storageKey: string) {
    return this.filesService.presignDownload(storageKey);
  }
}
