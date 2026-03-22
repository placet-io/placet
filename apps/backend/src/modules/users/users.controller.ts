import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  DeletedResponse,
  ErrorResponse,
  UserResponse,
} from '../../common/swagger-responses';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { OwnerGuard } from '../auth/guards/owner.guard';
import type { RequestWithUser } from '../../common/types';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OwnerGuard)
@Controller('api/users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @ApiOperation({ summary: 'List all users (owner only)' })
  @ApiOkResponse({ description: 'List of users', type: [UserResponse] })
  @ApiUnauthorizedResponse({ description: 'Not authenticated', type: ErrorResponse })
  @ApiForbiddenResponse({ description: 'Owner access required', type: ErrorResponse })
  findAll() {
    return this.usersService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Create a new user (owner only)' })
  @ApiCreatedResponse({ description: 'User created', type: UserResponse })
  @ApiConflictResponse({ description: 'Email already in use', type: ErrorResponse })
  @ApiUnauthorizedResponse({ description: 'Not authenticated', type: ErrorResponse })
  @ApiForbiddenResponse({ description: 'Owner access required', type: ErrorResponse })
  create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a user (owner only)' })
  @ApiOkResponse({ description: 'User updated', type: UserResponse })
  @ApiNotFoundResponse({ description: 'User not found', type: ErrorResponse })
  @ApiUnauthorizedResponse({ description: 'Not authenticated', type: ErrorResponse })
  @ApiForbiddenResponse({ description: 'Owner access required', type: ErrorResponse })
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a user (owner only)' })
  @ApiOkResponse({ description: 'User deleted', type: DeletedResponse })
  @ApiNotFoundResponse({ description: 'User not found', type: ErrorResponse })
  @ApiForbiddenResponse({ description: 'Cannot delete own account / Owner access required', type: ErrorResponse })
  @ApiUnauthorizedResponse({ description: 'Not authenticated', type: ErrorResponse })
  remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    if (req.user.id === id) {
      throw new ForbiddenException('Cannot delete your own account');
    }
    return this.usersService.remove(id);
  }
}
