import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model, SortOrder as MongoSortOrder, Types, UpdateQuery } from 'mongoose';
import { Order, OrderDocument } from '../schemas/order.schema';
import { OrderStatus } from '../../../common/enums/order-status.enum';

@Injectable()
export class OrderRepository {
  constructor(@InjectModel(Order.name) private readonly model: Model<OrderDocument>) {}

  create(data: Partial<Order>): Promise<OrderDocument> {
    return this.model.create(data);
  }

  findById(id: string): Promise<OrderDocument | null> {
    if (!Types.ObjectId.isValid(id)) return Promise.resolve(null);
    return this.model.findById(id).exec();
  }

  findByExternalReference(ref: string): Promise<OrderDocument | null> {
    return this.model.findOne({ externalReference: ref }).exec();
  }

  async list(
    filter: FilterQuery<OrderDocument>,
    sort: Record<string, MongoSortOrder>,
    projection: Record<string, number> | null,
    page: number,
    limit: number,
  ): Promise<{ items: OrderDocument[]; total: number }> {
    const skip = (page - 1) * limit;
    const query = this.model
      .find(filter, projection ?? undefined)
      .sort(sort)
      .skip(skip)
      .limit(limit);
    const [items, total] = await Promise.all([
      query.exec(),
      this.model.countDocuments(filter).exec(),
    ]);
    return { items, total };
  }

  update(id: string, data: UpdateQuery<OrderDocument>): Promise<OrderDocument | null> {
    return this.model.findByIdAndUpdate(id, data, { new: true, runValidators: true }).exec();
  }

  delete(id: string): Promise<OrderDocument | null> {
    return this.model.findByIdAndDelete(id).exec();
  }

  /**
   * Atomic assignment — only succeeds when order is CREATED and unassigned.
   * Guards against race conditions without transactions.
   */
  atomicAssign(orderId: string, captainId: string): Promise<OrderDocument | null> {
    return this.model
      .findOneAndUpdate(
        {
          _id: new Types.ObjectId(orderId),
          status: OrderStatus.CREATED,
          captainId: null,
        },
        {
          $set: {
            captainId: new Types.ObjectId(captainId),
            status: OrderStatus.ASSIGNED,
          },
        },
        { new: true },
      )
      .exec();
  }

  /** Atomic unassign — only succeeds when order is ASSIGNED (not past pickup). */
  atomicUnassign(orderId: string): Promise<OrderDocument | null> {
    return this.model
      .findOneAndUpdate(
        { _id: new Types.ObjectId(orderId), status: OrderStatus.ASSIGNED },
        { $set: { captainId: null, status: OrderStatus.CREATED } },
        { new: true },
      )
      .exec();
  }

  /** Atomic status transition — guarded by `from` status. */
  atomicTransitionStatus(
    orderId: string,
    from: OrderStatus,
    to: OrderStatus,
  ): Promise<OrderDocument | null> {
    return this.model
      .findOneAndUpdate(
        { _id: new Types.ObjectId(orderId), status: from },
        { $set: { status: to } },
        { new: true },
      )
      .exec();
  }

  findActiveOrdersForCaptain(captainId: string): Promise<OrderDocument[]> {
    return this.model
      .find({
        captainId: new Types.ObjectId(captainId),
        status: { $in: [OrderStatus.ASSIGNED, OrderStatus.PICKED_UP] },
      })
      .select('_id status')
      .exec();
  }
}
