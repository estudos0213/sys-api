import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service';
import { LoginDto } from './dto';
import { DUMMY_PASSWORD_HASH, verifyPassword } from './password';

export const ACCESS_TOKEN_TTL_SECONDS = 3600;

@Injectable()
export class AuthService {
  constructor(
    private readonly database: DatabaseService,
    private readonly jwt: JwtService,
  ) {}

  async login({ email, password }: LoginDto) {
    const user = await this.database.findUserForLogin(email);
    const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
    if (!user || !valid) throw new UnauthorizedException('Invalid email or password');

    const identity = { id: user.id, email: user.email, tenantId: user.tenantId };
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
    });
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      user: identity,
    };
  }
}
