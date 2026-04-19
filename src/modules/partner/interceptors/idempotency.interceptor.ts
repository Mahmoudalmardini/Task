import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Observable, from, of, switchMap, tap } from 'rxjs';
import * as crypto from 'crypto';
import {
  IdempotencyRecord,
  IdempotencyRecordDocument,
} from '../schemas/idempotency.schema';
import { API_KEY_REQUEST_PROP } from '../guards/api-key.guard';

/**
 * Idempotency interceptor for partner write endpoints.
 *
 * Flow:
 *   1. Reads `Idempotency-Key` header. If absent, pass through.
 *   2. Computes sha256(body). Looks up record by `${apiKeyId}:${key}`.
 *   3. If record exists AND requestHash matches → replay stored response (cache hit).
 *   4. If record exists AND requestHash differs → 409 (key reuse with different body).
 *   5. If no record → run handler, then persist response with TTL.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    @InjectModel(IdempotencyRecord.name)
    private readonly model: Model<IdempotencyRecordDocument>,
    private readonly config: ConfigService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest();
    const res = http.getResponse();

    const key = req.header('idempotency-key') as string | undefined;
    const apiKey = req[API_KEY_REQUEST_PROP] as { id: string; name: string } | undefined;
    if (!key || !apiKey) return next.handle();

    const requestHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(req.body ?? {}))
      .digest('hex');
    const compositeKey = `${apiKey.id}:${key}`;

    return from(this.model.findOne({ key: compositeKey }).exec()).pipe(
      switchMap((existing) => {
        if (existing) {
          if (existing.requestHash !== requestHash) {
            throw new ConflictException(
              'Idempotency-Key was previously used with a different request body',
            );
          }
          this.logger.log(`Idempotency replay for key=${key} apiKey=${apiKey.name}`);
          res.status(existing.responseStatus);
          res.setHeader('Idempotency-Replayed', 'true');
          return of(existing.responseBody);
        }
        return next.handle().pipe(
          tap(async (body: unknown) => {
            try {
              const ttlHours = this.config.get<number>('idempotency.ttlHours') ?? 24;
              await this.model.create({
                key: compositeKey,
                apiKeyId: new Types.ObjectId(apiKey.id),
                requestHash,
                responseStatus: res.statusCode ?? 201,
                responseBody: body as Record<string, unknown>,
                expiresAt: new Date(Date.now() + ttlHours * 3600 * 1000),
              });
            } catch (err) {
              this.logger.warn(
                `Failed to persist idempotency record: ${(err as Error).message}`,
              );
            }
          }),
        );
      }),
    );
  }
}
