import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AuthenticatedUser } from '../types/authenticated-user.js';

function cookieExtractor(request: { headers: { cookie?: string } }): string | null {
  const cookie = request.headers.cookie?.split(';').map((part) => part.trim()).find((part) => part.startsWith('pcc_access_token='));
  return cookie ? decodeURIComponent(cookie.slice('pcc_access_token='.length)) : null;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET must be configured');
    super({ jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor]), ignoreExpiration: false, secretOrKey: secret });
  }

  async validate(payload: { sub: string; email: string }): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, email: true, globalRole: true, isActive: true } });
    if (!user?.isActive) throw new UnauthorizedException('Invalid authentication');
    return user;
  }
}