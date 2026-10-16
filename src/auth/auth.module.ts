import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService, ACCESS_TOKEN_TTL_SECONDS } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  imports: [JwtModule.registerAsync({
    useFactory: () => {
      const secret = process.env.JWT_SECRET;
      if (!secret || Buffer.byteLength(secret) < 32) {
        throw new Error('JWT_SECRET must contain at least 32 bytes');
      }
      return {
        secret,
        signOptions: {
          algorithm: 'HS256' as const,
          expiresIn: ACCESS_TOKEN_TTL_SECONDS,
          issuer: 'sys-api',
          audience: 'sys-api',
        },
        verifyOptions: { algorithms: ['HS256' as const], issuer: 'sys-api', audience: 'sys-api' },
      };
    },
  })],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [JwtModule, JwtAuthGuard],
})
export class AuthModule {}
