import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import {
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
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

@ApiTags('Auth')
@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiOkResponse({ description: 'Login successful, JWT cookie set', type: LoginResponse })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials', type: ErrorResponse })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: FastifyReply,
  ) {
    const result = await this.authService.login(dto.email, dto.password);

    res.setCookie('access_token', result.accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return { user: result.user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Logout (clear cookie)' })
  @ApiOkResponse({ description: 'Cookie cleared', type: MessageResponse })
  logout(@Res({ passthrough: true }) res: FastifyReply) {
    res.clearCookie('access_token', { path: '/' });
    return { message: 'Logged out' };
  }
}
