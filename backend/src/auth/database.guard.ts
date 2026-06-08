import { Injectable, CanActivate, ExecutionContext, ServiceUnavailableException } from '@nestjs/common';


@Injectable()
export class DatabaseGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const isConnected = true;
    
    if (!isConnected) {
      throw new ServiceUnavailableException('Database connection is not available');
    }
    
    return true;
  }
}
