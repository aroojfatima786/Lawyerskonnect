import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Observable } from 'rxjs';
import * as jwt from 'jsonwebtoken';

type JwtPayload = {
  userId?: string;          // our app’s id field
  sub?: string;             // common JWT subject field
  iat?: number;
  exp?: number;
  [k: string]: any;
};

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const req = context.switchToHttp().getRequest();
    const isMultiSessionTestMode = process.env.AUTH_MODE === 'multisession_test';

    // 1) CORS preflight should pass
    if (req.method === 'OPTIONS') return true;

    // 2) Resolve token source by mode:
    // multisession_test => prefer Authorization header
    // normal mode => prefer cookie for existing behavior
    const cookieName = process.env.ACCESS_TOKEN_COOKIE_NAME || 'access_token';
    const authHeader = req.headers['authorization'] || req.headers['Authorization'];
    let headerToken: string | undefined;
    if (authHeader && typeof authHeader === 'string') {
      // Accept “Bearer <jwt>” OR raw token
      const parts = authHeader.split(' ');
      headerToken = parts.length === 2 && /^Bearer$/i.test(parts[0]) ? parts[1] : authHeader.trim();
    }

    const cookieToken: string | undefined = req.cookies?.[cookieName];
    const token: string | undefined = isMultiSessionTestMode
      ? (headerToken || cookieToken)
      : (cookieToken || headerToken);

    if (!token) {
      throw new UnauthorizedException('No token found'); // keep same text so FE behavior unchanged
    }

    const secret = process.env.JWT_SECRET?.trim();
    if (!secret) {
      throw new UnauthorizedException('JWT secret is not configured');
    }
    try {
      const decoded = jwt.verify(token, secret) as JwtPayload;

      // normalize user id
      const userId = decoded.userId || decoded.sub;
      if (!userId) {
        throw new Error('JWT payload missing user id (userId/sub).');
      }

      // what controllers expect:
      req.user = { ...decoded, userId: String(userId) };
      return true;
    } catch (err: any) {
      const isProd = process.env.NODE_ENV === 'production';
      // dev me detailed, prod me generic
      const msg = isProd ? 'Invalid token' : `Invalid token: ${err?.message || 'verify failed'}`;
      throw new UnauthorizedException(msg);
    }
  }
}
