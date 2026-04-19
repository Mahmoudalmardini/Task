import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { ApiKey, ApiKeyDocument } from '../schemas/api-key.schema';

export const API_KEY_REQUEST_PROP = 'partnerApiKey';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(@InjectModel(ApiKey.name) private readonly apiKeys: Model<ApiKeyDocument>) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const raw = req.header('x-api-key') as string | undefined;
    if (!raw) throw new UnauthorizedException('Missing X-API-Key header');

    const prefix = raw.slice(0, 8);
    const candidate = await this.apiKeys.findOne({ prefix, active: true }).exec();
    if (!candidate) throw new UnauthorizedException('Invalid API key');

    const match = await bcrypt.compare(raw, candidate.hashedKey);
    if (!match) throw new UnauthorizedException('Invalid API key');

    req[API_KEY_REQUEST_PROP] = { id: candidate._id.toString(), name: candidate.name };
    return true;
  }
}
