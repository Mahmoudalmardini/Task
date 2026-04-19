import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';
import { Order, OrderDocument } from '../orders/schemas/order.schema';
import {
  DropSortBy,
  DropSortOrder,
  OrderVolumeDropItemDto,
  OrderVolumeDropQueryDto,
} from './dto/order-volume-drop.dto';
import {
  buildPaginatedResponse,
  PaginatedResponse,
} from '../../common/dto/paginated-response.dto';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(@InjectModel(Order.name) private readonly orders: Model<OrderDocument>) {}

  async orderVolumeDrop(
    q: OrderVolumeDropQueryDto,
  ): Promise<PaginatedResponse<OrderVolumeDropItemDto>> {
    this.validateWindows(q);

    const sortSign = q.sortOrder === DropSortOrder.ASC ? 1 : -1;
    const sortField = q.sortBy ?? DropSortBy.DROP_PERCENTAGE;
    const page = q.page ?? 1;
    const limit = q.limit ?? 20;
    const skip = (page - 1) * limit;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pipeline: any[] = [
      {
        $match: {
          captainId: { $ne: null },
          createdAt: { $gte: q.previousFrom, $lte: q.currentTo },
        },
      },
      {
        $facet: {
          previous: [
            { $match: { createdAt: { $gte: q.previousFrom, $lte: q.previousTo } } },
            { $group: { _id: '$captainId', count: { $sum: 1 } } },
          ],
          current: [
            { $match: { createdAt: { $gte: q.currentFrom, $lte: q.currentTo } } },
            { $group: { _id: '$captainId', count: { $sum: 1 } } },
          ],
        },
      },
      {
        $project: {
          captains: { $concatArrays: ['$previous', '$current'] },
          previous: 1,
          current: 1,
        },
      },
      { $unwind: '$captains' },
      { $group: { _id: '$captains._id', previous: { $first: '$previous' }, current: { $first: '$current' } } },
      {
        $project: {
          captainId: '$_id',
          _id: 0,
          previousOrders: {
            $let: {
              vars: {
                match: {
                  $first: {
                    $filter: {
                      input: '$previous',
                      as: 'p',
                      cond: { $eq: ['$$p._id', '$_id'] },
                    },
                  },
                },
              },
              in: { $ifNull: ['$$match.count', 0] },
            },
          },
          currentOrders: {
            $let: {
              vars: {
                match: {
                  $first: {
                    $filter: {
                      input: '$current',
                      as: 'c',
                      cond: { $eq: ['$$c._id', '$_id'] },
                    },
                  },
                },
              },
              in: { $ifNull: ['$$match.count', 0] },
            },
          },
        },
      },
      {
        $addFields: {
          dropCount: { $subtract: ['$previousOrders', '$currentOrders'] },
          dropPercentage: {
            $cond: [
              { $gt: ['$previousOrders', 0] },
              {
                $multiply: [
                  { $divide: [{ $subtract: ['$previousOrders', '$currentOrders'] }, '$previousOrders'] },
                  100,
                ],
              },
              0,
            ],
          },
        },
      },
      {
        $match: {
          previousOrders: { $gte: q.minPreviousOrders ?? 1 },
          dropCount: { $gt: 0 },
          dropPercentage: { $gte: q.minDropPercentage ?? 0 },
        },
      },
      {
        $lookup: {
          from: 'captains',
          localField: 'captainId',
          foreignField: '_id',
          as: 'captain',
        },
      },
      { $unwind: { path: '$captain', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          captainId: { $toString: '$captainId' },
          captainName: { $ifNull: ['$captain.name', 'Unknown'] },
          previousOrders: 1,
          currentOrders: 1,
          dropCount: 1,
          dropPercentage: { $round: ['$dropPercentage', 2] },
        },
      },
      {
        $facet: {
          data: [{ $sort: { [sortField]: sortSign } }, { $skip: skip }, { $limit: limit }],
          totalArr: [{ $count: 'total' }],
        },
      },
    ];

    const [result] = await this.orders.aggregate(pipeline);
    const data = (result?.data ?? []) as OrderVolumeDropItemDto[];
    const total = (result?.totalArr?.[0]?.total as number | undefined) ?? 0;
    this.logger.log(
      `Report order-volume-drop → ${data.length}/${total} (previous ${q.previousFrom.toISOString()}..${q.previousTo.toISOString()}, current ${q.currentFrom.toISOString()}..${q.currentTo.toISOString()})`,
    );
    return buildPaginatedResponse(data, total, page, limit);
  }

  private validateWindows(q: OrderVolumeDropQueryDto): void {
    if (q.previousFrom > q.previousTo) {
      throw new BadRequestException('previousFrom must be <= previousTo');
    }
    if (q.currentFrom > q.currentTo) {
      throw new BadRequestException('currentFrom must be <= currentTo');
    }
    if (q.previousTo > q.currentFrom) {
      throw new BadRequestException('Previous period must end before current period starts');
    }
  }
}
