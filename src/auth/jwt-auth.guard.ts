import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { isEmail, isUUID } from 'class-validator';
import type { Request } from 'express';

export interface JwtIdentity {
  sub: string;
  email: string;
  tenantId: string;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  user: JwtIdentity;
  tenantId: string;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const match = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization ?? '');
    if (!match) throw new UnauthorizedException('A Bearer token is required');

    try {
      const payload = await this.jwt.verifyAsync<JwtIdentity>(match[1]);
      if (
        typeof payload.sub !== 'string' || !isUUID(payload.sub) ||
        typeof payload.tenantId !== 'string' || !isUUID(payload.tenantId) ||
        typeof payload.email !== 'string' || !isEmail(payload.email) ||
        typeof payload.exp !== 'number'
      ) throw new Error('Invalid token claims');

      request.user = payload;
      request.tenantId = payload.tenantId;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
