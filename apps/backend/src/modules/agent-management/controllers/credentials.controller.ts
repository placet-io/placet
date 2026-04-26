import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { RequestWithUser } from '../../../common/types';
import { ManagementClient } from '../management-client.service';

@ApiTags('Agent Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/agents/:agentId/manage/credentials')
export class ManageCredentialsController {
  constructor(private readonly client: ManagementClient) {}

  @Get()
  @ApiOperation({ summary: 'List credential keys (values masked)' })
  list(@Req() req: RequestWithUser, @Param('agentId') agentId: string) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: 'credentials',
    });
  }

  @Get(':key')
  @ApiOperation({ summary: 'Existence check for a single credential key' })
  get(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('key') key: string,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: `credentials/${encodeURIComponent(key)}`,
    });
  }

  @Put(':key')
  @ApiOperation({ summary: 'Upsert a credential value' })
  put(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('key') key: string,
    @Body() body: { value: string },
  ) {
    if (!body || typeof body.value !== 'string') {
      throw new BadRequestException('Field "value" must be a string');
    }
    if (Buffer.byteLength(body.value, 'utf8') > 64 * 1024) {
      throw new BadRequestException('Credential value exceeds 64KB limit');
    }
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'PUT',
      path: `credentials/${encodeURIComponent(key)}`,
      body,
    });
  }

  @Put(':key/exposed')
  @ApiOperation({
    summary:
      'Toggle whether this credential is injected as an env var into the exec sandbox',
  })
  putExposed(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('key') key: string,
    @Body() body: { exposed: boolean },
  ) {
    if (!body || typeof body.exposed !== 'boolean') {
      throw new BadRequestException('Field "exposed" must be a boolean');
    }
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'PUT',
      path: `credentials/${encodeURIComponent(key)}/exposed`,
      body,
    });
  }

  @Delete(':key')
  @ApiOperation({ summary: 'Remove a credential' })
  remove(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Param('key') key: string,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'DELETE',
      path: `credentials/${encodeURIComponent(key)}`,
    });
  }
}
