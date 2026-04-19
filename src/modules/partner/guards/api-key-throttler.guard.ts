import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { API_KEY_REQUEST_PROP } from './api-key.guard';

/**
 * Rate-limits per resolved API key (not per IP). Falls back to IP if the key is
 * somehow missing (guard should run after ApiKeyGuard).
 */
@Injectable()
export class ApiKeyThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const key = (req[API_KEY_REQUEST_PROP] as { id?: string } | undefined)?.id;
    return key ? `apikey:${key}` : (req.ip as string) || 'unknown';
  }
}
