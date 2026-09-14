import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import { Roles } from './decorators/roles.decorator.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { AuthService } from './auth.service.js';
import type { AuthenticatedUser } from './types/authenticated-user.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const token = await this.authService.login(dto);
    response.cookie('pcc_access_token', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: this.cookieMaxAge() });
    return { authenticated: true };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie('pcc_access_token', { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    return { authenticated: false };
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) { return this.authService.getCurrentUser(user.id); }

  @Roles('ADMIN')
  @Post('users')
  createUser(@Body() dto: CreateUserDto) { return this.authService.createUser(dto); }

  private cookieMaxAge(): number {
    const match = /^([0-9]+)([smhd])$/.exec(process.env.JWT_EXPIRES_IN ?? '15m');
    if (!match) return 15 * 60 * 1000;
    const units: Record<string, number> = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
    return Number(match[1]) * units[match[2]];
  }
}