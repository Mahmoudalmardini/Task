import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, Types, UpdateQuery } from 'mongoose';
import { Captain, CaptainDocument } from '../schemas/captain.schema';
import { CaptainStatus } from '../../../common/enums/captain-status.enum';

@Injectable()
export class CaptainRepository {
  constructor(@InjectModel(Captain.name) private readonly model: Model<CaptainDocument>) {}

  create(data: Partial<Captain>): Promise<CaptainDocument> {
    return this.model.create(data);
  }

  findById(id: string): Promise<CaptainDocument | null> {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.model.findById(id).exec();
  }

  findByPhone(phone: string): Promise<CaptainDocument | null> {
    return this.model.findOne({ phone }).exec();
  }

  async list(
    filter: FilterQuery<CaptainDocument>,
    page: number,
    limit: number,
  ): Promise<{ items: CaptainDocument[]; total: number }> {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.model.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  update(id: string, data: UpdateQuery<CaptainDocument>): Promise<CaptainDocument | null> {
    return this.model.findByIdAndUpdate(id, data, { new: true, runValidators: true }).exec();
  }

  delete(id: string): Promise<CaptainDocument | null> {
    return this.model.findByIdAndDelete(id).exec();
  }

  /** Atomic status flip — only succeeds if current status matches expected value. */
  atomicSetStatus(
    id: string,
    from: CaptainStatus,
    to: CaptainStatus,
  ): Promise<CaptainDocument | null> {
    return this.model
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), status: from },
        { $set: { status: to } },
        { new: true },
      )
      .exec();
  }

  updateLocation(id: string, lat: number, lng: number, at: Date): Promise<CaptainDocument | null> {
    return this.model
      .findOneAndUpdate(
        { _id: new Types.ObjectId(id), status: CaptainStatus.ACTIVE },
        { $set: { currentLocation: { lat, lng, updatedAt: at } } },
        { new: true },
      )
      .exec();
  }
}
