import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/jwt-auth.guard';

export const TenantId = createParamDecorator((_data: unknown, context: ExecutionContext): string => {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  return request.tenantId;
});
