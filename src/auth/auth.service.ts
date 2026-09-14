import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { LoginDto } from './dto/login.dto.js';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService, private readonly jwtService: JwtService) {}

  async createUser(dto: CreateUserDto) {
    try {
      return await this.prisma.user.create({ data: { email: dto.email.trim().toLowerCase(), passwordHash: await argon2.hash(dto.password) }, select: { id: true, email: true, globalRole: true, isActive: true, createdAt: true } });
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'P2002') throw new ConflictException('User email already exists');
      throw error;
    }
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.isActive || !(await argon2.verify(user.passwordHash, dto.password))) throw new UnauthorizedException('Invalid credentials');
    return this.jwtService.signAsync({ sub: user.id, email: user.email });
  }

  async getCurrentUser(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, globalRole: true, projectMemberships: { select: { projectId: true, role: true } } } });
  }
}