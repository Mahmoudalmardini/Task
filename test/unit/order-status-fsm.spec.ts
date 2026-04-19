import { canTransition, isTerminal } from '../../src/common/utils/status-fsm';
import { OrderStatus } from '../../src/common/enums/order-status.enum';

describe('Order status FSM', () => {
  describe('valid transitions', () => {
    const valid: Array<[OrderStatus, OrderStatus]> = [
      [OrderStatus.CREATED, OrderStatus.ASSIGNED],
      [OrderStatus.CREATED, OrderStatus.CANCELLED],
      [OrderStatus.ASSIGNED, OrderStatus.PICKED_UP],
      [OrderStatus.ASSIGNED, OrderStatus.CANCELLED],
      [OrderStatus.ASSIGNED, OrderStatus.CREATED],
      [OrderStatus.PICKED_UP, OrderStatus.DELIVERED],
      [OrderStatus.PICKED_UP, OrderStatus.CANCELLED],
    ];
    it.each(valid)('allows %s → %s', (from, to) => {
      expect(canTransition(from, to)).toBe(true);
    });
  });

  describe('invalid transitions', () => {
    const invalid: Array<[OrderStatus, OrderStatus]> = [
      [OrderStatus.DELIVERED, OrderStatus.CANCELLED],
      [OrderStatus.DELIVERED, OrderStatus.CREATED],
      [OrderStatus.CANCELLED, OrderStatus.CREATED],
      [OrderStatus.CANCELLED, OrderStatus.DELIVERED],
      [OrderStatus.CREATED, OrderStatus.PICKED_UP],
      [OrderStatus.CREATED, OrderStatus.DELIVERED],
      [OrderStatus.PICKED_UP, OrderStatus.ASSIGNED],
      [OrderStatus.PICKED_UP, OrderStatus.CREATED],
    ];
    it.each(invalid)('rejects %s → %s', (from, to) => {
      expect(canTransition(from, to)).toBe(false);
    });
  });

  describe('terminal states', () => {
    it('DELIVERED is terminal', () => expect(isTerminal(OrderStatus.DELIVERED)).toBe(true));
    it('CANCELLED is terminal', () => expect(isTerminal(OrderStatus.CANCELLED)).toBe(true));
    it('CREATED is not terminal', () => expect(isTerminal(OrderStatus.CREATED)).toBe(false));
    it('ASSIGNED is not terminal', () => expect(isTerminal(OrderStatus.ASSIGNED)).toBe(false));
    it('PICKED_UP is not terminal', () => expect(isTerminal(OrderStatus.PICKED_UP)).toBe(false));
  });
});
