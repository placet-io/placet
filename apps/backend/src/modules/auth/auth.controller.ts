import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import {
  ErrorResponse,
  LoginResponse,
  MessageResponse,
} from '../../common/swagger-responses';
import type { FastifyReply } from 'fastify';
import { AuthService, JwtPayload } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { RequestWithUser } from '../../common/types';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/',
  maxAge: 7 * 24 * 60 * 60, // 7 days
};

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiOkResponse({
    description: 'Login successful, JWT cookie set',
    type: LoginResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid credentials',
    type: ErrorResponse,
  })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const result = await this.authService.login(dto.email, dto.password);
    res.setCookie('access_token', result.accessToken, COOKIE_OPTIONS);
    return { user: result.user };
  }

  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiOkResponse({
    description: 'New JWT cookie set',
    type: LoginResponse,
  })
  @ApiUnauthorizedResponse({
    description: 'Invalid or expired token',
    type: ErrorResponse,
  })
  async refresh(
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const payload: JwtPayload = {
      sub: req.user.id,
      email: req.user.email,
      role: req.user.role,
    };
    const result = await this.authService.refresh(payload);
    res.setCookie('access_token', result.accessToken, COOKIE_OPTIONS);
    return { user: result.user };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user' })
  @ApiOkResponse({ description: 'Current user info' })
  @ApiUnauthorizedResponse({
    description: 'Not authenticated',
    type: ErrorResponse,
  })
  me(@Req() req: RequestWithUser) {
    return {
      user: {
        id: req.user.id,
        email: req.user.email,
        displayName: req.user.displayName,
        role: req.user.role,
        mustChangePassword: req.user.mustChangePassword,
      },
    };
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password (required on first login)' })
  @ApiOkResponse({ description: 'Password changed successfully' })
  @ApiUnauthorizedResponse({
    description: 'Current password incorrect',
    type: ErrorResponse,
  })
  changePassword(@Req() req: RequestWithUser, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(
      req.user.id,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout (clear cookie)' })
  @ApiOkResponse({ description: 'Cookie cleared', type: MessageResponse })
  logout(@Res({ passthrough: true }) res: FastifyReply) {
    res.clearCookie('access_token', { path: '/' });
    return { message: 'Logged out' };
  }

  @Post('ws-ticket')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get a short-lived ticket for WebSocket auth' })
  @ApiOkResponse({ description: 'WebSocket ticket (valid 30s)' })
  wsTicket(@Req() req: RequestWithUser) {
    const ticket = this.authService.createWsTicket(req.user.id);
    return { ticket };
  }
}
