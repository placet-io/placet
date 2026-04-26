import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Put,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import type { RequestWithUser } from '../../../common/types';
import { ManagementClient } from '../management-client.service';
import { assertObjectBody } from '../body-validation';

type ManageQuery = Record<string, string | string[] | undefined>;

const MAX_PATH_LEN = 1024;

/**
 * Defense-in-depth path validation. The upstream agent runtime is the source
 * of truth for what is reachable, but Placet rejects obviously malicious or
 * malformed inputs before forwarding so attackers cannot probe the upstream.
 */
function sanitizeWorkspaceQuery(
  query: ManageQuery,
  { requirePath }: { requirePath: boolean },
): ManageQuery {
  const raw = query.path;
  const value = Array.isArray(raw) ? raw[0] : raw;

  if (value === undefined || value === '') {
    if (requirePath) {
      throw new BadRequestException('Query parameter "path" is required');
    }
    return query;
  }
  if (typeof value !== 'string') {
    throw new BadRequestException('Query parameter "path" must be a string');
  }
  if (value.length > MAX_PATH_LEN) {
    throw new BadRequestException(
      `Query parameter "path" exceeds ${MAX_PATH_LEN} characters`,
    );
  }
  if (
    Array.from(value).some((char) => {
      const code = char.charCodeAt(0);
      return code >= 0x00 && code <= 0x1f;
    })
  ) {
    throw new BadRequestException(
      'Query parameter "path" contains control characters',
    );
  }
  if (value.startsWith('/') || value.startsWith('\\')) {
    throw new BadRequestException(
      'Query parameter "path" must be workspace-relative',
    );
  }
  const segments = value.split(/[/\\]/);
  if (segments.some((s) => s === '..')) {
    throw new BadRequestException(
      'Query parameter "path" must not contain ".." segments',
    );
  }
  return { ...query, path: value };
}

@ApiTags('Agent Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('api/agents/:agentId/manage/workspace')
export class ManageWorkspaceController {
  constructor(private readonly client: ManagementClient) {}

  @Get('tree')
  @ApiOperation({ summary: 'Directory tree listing' })
  tree(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Query() query: ManageQuery,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: 'workspace/tree',
      query: sanitizeWorkspaceQuery(query, { requirePath: false }),
    });
  }

  @Get('file')
  @ApiOperation({ summary: 'Read file contents' })
  read(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Query() query: ManageQuery,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'GET',
      path: 'workspace/file',
      query: sanitizeWorkspaceQuery(query, { requirePath: true }),
    });
  }

  @Put('file')
  @ApiOperation({ summary: 'Write file contents' })
  write(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Query() query: ManageQuery,
    @Body() body: Record<string, unknown>,
  ) {
    assertObjectBody(body, 'Workspace write body');
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'PUT',
      path: 'workspace/file',
      query: sanitizeWorkspaceQuery(query, { requirePath: true }),
      body,
    });
  }

  @Delete('file')
  @ApiOperation({ summary: 'Delete a file' })
  remove(
    @Req() req: RequestWithUser,
    @Param('agentId') agentId: string,
    @Query() query: ManageQuery,
  ) {
    return this.client.request({
      agentId,
      ownerId: req.user.id,
      method: 'DELETE',
      path: 'workspace/file',
      query: sanitizeWorkspaceQuery(query, { requirePath: true }),
    });
  }
}
