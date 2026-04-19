import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { LocationsService } from './locations.service';
import { LocationUpdateDto } from './dto/location-update.dto';
import { Role } from '../../common/enums/role.enum';
import { OrdersService } from '../orders/orders.service';

interface AuthedSocket extends Socket {
  data: {
    user?: { sub: string; role: Role };
  };
}

/**
 * Socket.IO namespace: /locations
 *
 * Auth: handshake must provide JWT via `auth.token` OR `Authorization: Bearer <token>` header.
 *
 * Client → server events:
 *   - captain:location:update  { lat, lng }
 *
 * Server → client events (broadcast):
 *   - captain:location:updated { captainId, lat, lng, recordedAt }
 *
 * Rooms:
 *   - admins                  (joined automatically by admins on connect)
 *   - order:<orderId>         (admins join these explicitly when viewing an order; updates for
 *                              the assigned captain are mirrored into the order's room)
 */
@WebSocketGateway({ namespace: '/locations', cors: { origin: '*' } })
export class LocationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() private readonly server!: Server;
  private readonly logger = new Logger(LocationsGateway.name);

  constructor(
    private readonly jwt: JwtService,
    private readonly locations: LocationsService,
    private readonly orders: OrdersService,
  ) {}

  async handleConnection(client: AuthedSocket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.warn(`Rejected socket ${client.id}: missing token`);
      client.emit('error', 'Unauthorized: missing token');
      client.disconnect(true);
      return;
    }
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; role: Role }>(token);
      client.data.user = { sub: payload.sub, role: payload.role };

      if (payload.role === Role.ADMIN) {
        await client.join('admins');
        this.logger.log(`Admin socket connected ${client.id} (sub=${payload.sub})`);
      } else if (payload.role === Role.CAPTAIN) {
        this.logger.log(`Captain socket connected ${client.id} (sub=${payload.sub})`);
      } else {
        client.emit('error', 'Unsupported role for /locations namespace');
        client.disconnect(true);
      }
    } catch (err) {
      this.logger.warn(`Rejected socket ${client.id}: ${(err as Error).message}`);
      client.emit('error', 'Unauthorized: invalid token');
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthedSocket): void {
    this.logger.log(`Socket disconnected ${client.id}`);
  }

  @SubscribeMessage('admin:subscribe:order')
  async subscribeAdminToOrder(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { orderId: string },
  ): Promise<{ ok: true }> {
    if (client.data.user?.role !== Role.ADMIN) {
      throw new WsException('Only admins can subscribe to order rooms');
    }
    await client.join(`order:${body.orderId}`);
    return { ok: true };
  }

  @SubscribeMessage('captain:location:update')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async onLocationUpdate(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() dto: LocationUpdateDto,
  ): Promise<{ ok: true }> {
    const user = client.data.user;
    if (!user || user.role !== Role.CAPTAIN) {
      throw new WsException('Only captains can emit location updates');
    }

    try {
      const result = await this.locations.recordUpdate(user.sub, dto.lat, dto.lng);
      this.server.to('admins').emit('captain:location:updated', result);
      const orderIds = await this.orders.activeOrderIdsForCaptain(user.sub);
      for (const orderId of orderIds) {
        this.server.to(`order:${orderId}`).emit('captain:location:updated', result);
      }
      return { ok: true };
    } catch (err) {
      throw new WsException((err as Error).message);
    }
  }

  private extractToken(client: Socket): string | null {
    const authToken = (client.handshake.auth as { token?: string } | undefined)?.token;
    if (authToken) return authToken;
    const header = client.handshake.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length);
    return null;
  }
}
