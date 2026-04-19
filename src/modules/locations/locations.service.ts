import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  LocationHistory,
  LocationHistoryDocument,
} from './schemas/location-history.schema';
import { CaptainRepository } from '../captains/repositories/captain.repository';

export interface LocationUpdateResult {
  captainId: string;
  lat: number;
  lng: number;
  recordedAt: Date;
}

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);

  constructor(
    @InjectModel(LocationHistory.name)
    private readonly historyModel: Model<LocationHistoryDocument>,
    private readonly captainRepo: CaptainRepository,
  ) {}

  /**
   * Persists captain's latest location (atomic, only if ACTIVE) and appends to history.
   * Throws if captain does not exist or is INACTIVE.
   */
  async recordUpdate(captainId: string, lat: number, lng: number): Promise<LocationUpdateResult> {
    const now = new Date();
    const updated = await this.captainRepo.updateLocation(captainId, lat, lng, now);
    if (!updated) {
      this.logger.warn(
        `Rejected location update for captain ${captainId} (not found or inactive)`,
      );
      throw new Error('Captain is not active or does not exist');
    }
    await this.historyModel.create({
      captainId: new Types.ObjectId(captainId),
      lat,
      lng,
      recordedAt: now,
    });
    this.logger.debug?.(`Captain ${captainId} location updated (${lat}, ${lng})`);
    return { captainId, lat, lng, recordedAt: now };
  }
}
