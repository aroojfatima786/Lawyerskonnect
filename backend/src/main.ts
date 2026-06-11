import './config/mongodb-dns-bootstrap';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import cookieParser from 'cookie-parser';
import express, { json, urlencoded } from 'express';
import helmet from 'helmet';
import path from 'path';
import { existsSync, mkdirSync } from 'fs';
import { EventEmitter2 } from '@nestjs/event-emitter';

const uploadDir = path.join(process.cwd(), 'uploads', 'verification');
if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true });
}
import { AdminService } from './services/admin.service';
process.env.TZ = 'UTC';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    const requiredEnvVars = ['MONGODB_URI'];
    const missingVars = requiredEnvVars.filter((k) => !process.env[k]);
    if (missingVars.length > 0) {
      throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
    }

    logger.log('Starting application...');
    const app = await NestFactory.create(AppModule, { rawBody: true });

    // Using Helmet for security headers
    app.use(
      helmet({
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        contentSecurityPolicy: false,
      }),
    );

    // Stripe webhook: raw body only (skip global JSON parser on this path).
    const STRIPE_WEBHOOK_PATH = '/payment/stripe/webhook';
    app.use(
      STRIPE_WEBHOOK_PATH,
      express.raw({
        type: 'application/json',
        verify: (req: express.Request & { rawBody?: Buffer }, _res, buf) => {
          req.rawBody = buf;
        },
      }),
    );

    // Body parser configuration (webhook path excluded — JSON would break signature verification)
    app.use((req, res, next) => {
      const pathOnly = (req.originalUrl || req.url || '').split('?')[0];
      if (pathOnly === STRIPE_WEBHOOK_PATH) {
        return next();
      }
      return json({ limit: '50mb' })(req, res, next);
    });
    app.use((req, res, next) => {
      const pathOnly = (req.originalUrl || req.url || '').split('?')[0];
      if (pathOnly === STRIPE_WEBHOOK_PATH) {
        return next();
      }
      return urlencoded({ extended: true, limit: '50mb', parameterLimit: 50000 })(req, res, next);
    });
    app.use(cookieParser());
    // Serve uploaded verification documents
    app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

    // CORS: production uses CORS_ORIGINS and/or FRONTEND_URL. Development also merges CORS_DEV_ORIGINS (defaults to local dev servers).
    // Never use origin '*': the browser rejects `Access-Control-Allow-Origin: *` when fetch uses `credentials: 'include'`.
    const isProd = process.env.NODE_ENV === 'production';
    const normalizeOrigin = (s: string) => s.trim().replace(/\/$/, '');
    const explicit = (process.env.CORS_ORIGINS || '')
      .split(',')
      .map(normalizeOrigin)
      .filter((s) => s.length > 0 && s !== '*' && /^https?:\/\//i.test(s));
    const devExtras = (process.env.CORS_DEV_ORIGINS || 'http://localhost:5173,http://localhost:3000')
      .split(',')
      .map(normalizeOrigin)
      .filter((s) => s.length > 0 && s !== '*' && /^https?:\/\//i.test(s));
    const fe = normalizeOrigin(process.env.FRONTEND_URL || '');
    const feOk = fe && fe !== '*' && /^https?:\/\//i.test(fe);

    let corsOrigins: string[];
    if (explicit.length) {
      corsOrigins = isProd ? Array.from(new Set(explicit)) : Array.from(new Set([...explicit, ...devExtras]));
    } else if (isProd) {
      if (feOk) {
        corsOrigins = [fe];
      } else {
        throw new Error('Production CORS: set CORS_ORIGINS (comma-separated) or FRONTEND_URL');
      }
    } else {
      corsOrigins = Array.from(new Set([...devExtras, ...(feOk ? [fe] : [])]));
    }

    const allowedOrigins = new Set(corsOrigins);

    const loggerCors = new Logger('CORS');
    loggerCors.log(`CORS Origins (NODE_ENV=${process.env.NODE_ENV}): ${JSON.stringify([...allowedOrigins])}`);

    app.enableCors({
      origin: (requestOrigin: string | undefined, callback: (err: Error | null, allow?: boolean | string) => void) => {
        if (requestOrigin && !allowedOrigins.has(requestOrigin)) {
          return callback(new Error(`CORS blocked origin: ${requestOrigin}`));
        }
        return callback(null, true);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    });

    // Global pipes for validation
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
        forbidUnknownValues: true,
        validationError: { target: false, value: false },
      }),
    );

    // EventEmitter2 setup
    const emitter = app.get(EventEmitter2);

    emitter.onAny((event: any, ..._args: any[]) => {
      const name = Array.isArray(event) ? event.join('.') : String(event);
      logger.log(`📡 Event: ${name}`);
    });

    const port = process.env.PORT || 3000;
    await app.listen(port);

    logger.log(`Application running on: http://localhost:${port}`);
    logger.log(`Stripe webhook endpoint: POST http://localhost:${port}/payment/stripe/webhook`);

    // Auto-seed categories on startup
    try {
      const adminService = app.get(AdminService);
      const seedResult = await adminService.seedCategories();
      logger.log(`Categories: ${seedResult.message}`);
    } catch (error) {
      logger.warn('Could not seed categories (AdminService might not be available)');
    }
  } catch (error: any) {
    logger.error('Failed to start application:', error?.message);
    process.exit(1);
  }
}

bootstrap();
