import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { AuthGuard } from './auth.guard';

function extractBearerFromCookie(req: any): string | undefined {
  // simple cookie parse (cookie-parser already mounted in main.ts)
  const cookie = req.headers?.cookie || '';
  const m = cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : undefined;
}

@Injectable()
export class OptionalAuthGuard implements CanActivate {
  constructor(private readonly moduleRef: ModuleRef) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();

    // 1) Try Authorization header
    let token: string | undefined;
    const auth = req.headers?.authorization;
    if (typeof auth === 'string' && auth.trim().startsWith('Bearer ')) {
      token = auth.trim().slice('Bearer '.length);
    }

    // 2) Fallback: cookie "access_token"
    if (!token) {
      token = extractBearerFromCookie(req);
      if (token) {
        // Inject header so downstream AuthGuard can work unchanged
        req.headers.authorization = `Bearer ${token}`;
      }
    }

    // No token anywhere => anonymous allowed
    if (!token) return true;

    // Try to resolve and delegate to existing AuthGuard
    let authGuard: AuthGuard | null = null;
    try {
      // resolve without throwing if not found
      authGuard = this.moduleRef.get<AuthGuard>(
        (require('./auth.guard').AuthGuard),
        { strict: false },
      );
    } catch {
      authGuard = null;
    }

    if (!authGuard) return true;

    try {
      const ok = await (authGuard as any).canActivate(context);
      return !!ok; // if valid, req.user is now set
    } catch {
      // invalid/expired token => proceed as anonymous (do NOT block)
      return true;
    }
  }
}
