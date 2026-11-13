import { asFunction } from 'awilix';

import { AccountService } from '@core/services/account.service';
import { AuthService } from '@core/services/auth.service';
import { BookingService } from '@core/services/booking.service';
import { CatalogService } from '@core/services/catalog.service';
import { DeviceService } from '@core/services/device.service';
import { PaymentService } from '@core/services/payment.service';
import { QueueService } from '@core/services/queue.service';
import { SignOutUseCase } from '@core/use_case/auth/sign-out.use-case';
import { RefreshSessionUseCase } from '@core/use_case/auth/refresh-session.use-case';
import { RequestSignInCodeUseCase } from '@core/use_case/auth/request-sign-in-code.use-case';
import { VerifySignInCodeUseCase } from '@core/use_case/auth/verify-sign-in-code.use-case';
import { EndOrderWindowUseCase } from '@core/use_case/booking/end-order-window.use-case';
import { GetOrderCategoriesUseCase } from '@core/use_case/booking/get-order-categories.use-case';
import { HoldBookingUseCase } from '@core/use_case/booking/hold-booking.use-case';
import { OrderTicketSelectionUseCase } from '@core/use_case/booking/order-ticket-selection.use-case';
import { ValidateAttendeeUseCase } from '@core/use_case/booking/validate-attendee.use-case';
import { GetHomeEventsUseCase } from '@core/use_case/catalog/get-home-events.use-case';
import { PayBookingUseCase } from '@core/use_case/payment/pay-booking.use-case';
import { ClaimTurnUseCase } from '@core/use_case/queue/claim-turn.use-case';
import { FollowQueueUseCase } from '@core/use_case/queue/follow-queue.use-case';
import { JoinQueueUseCase } from '@core/use_case/queue/join-queue.use-case';
import { LeaveQueueUseCase } from '@core/use_case/queue/leave-queue.use-case';
import { GetETicketUseCase } from '@core/use_case/ticket/get-e-ticket.use-case';
import { GetMyOrdersUseCase } from '@core/use_case/ticket/get-my-orders.use-case';

import container from './container';

/** Services and use cases: asFunction(Factory).singleton(). Added per feature by /add-feature. */
export function registerServices() {
  container.register({
    accountService: asFunction(AccountService).singleton(),
    authService: asFunction(AuthService).singleton(),
    catalogService: asFunction(CatalogService).singleton(),
    bookingService: asFunction(BookingService).singleton(),
    deviceService: asFunction(DeviceService).singleton(),
    queueService: asFunction(QueueService).singleton(),
    paymentService: asFunction(PaymentService).singleton(),
    getHomeEventsUseCase: asFunction(GetHomeEventsUseCase).singleton(),
    getOrderCategoriesUseCase: asFunction(GetOrderCategoriesUseCase).singleton(),
    orderTicketSelectionUseCase: asFunction(OrderTicketSelectionUseCase).singleton(),
    validateAttendeeUseCase: asFunction(ValidateAttendeeUseCase).singleton(),
    endOrderWindowUseCase: asFunction(EndOrderWindowUseCase).singleton(),
    holdBookingUseCase: asFunction(HoldBookingUseCase).singleton(),
    joinQueueUseCase: asFunction(JoinQueueUseCase).singleton(),
    followQueueUseCase: asFunction(FollowQueueUseCase).singleton(),
    claimTurnUseCase: asFunction(ClaimTurnUseCase).singleton(),
    leaveQueueUseCase: asFunction(LeaveQueueUseCase).singleton(),
    refreshSessionUseCase: asFunction(RefreshSessionUseCase).singleton(),
    signOutUseCase: asFunction(SignOutUseCase).singleton(),
    requestSignInCodeUseCase: asFunction(RequestSignInCodeUseCase).singleton(),
    verifySignInCodeUseCase: asFunction(VerifySignInCodeUseCase).singleton(),
    getMyOrdersUseCase: asFunction(GetMyOrdersUseCase).singleton(),
    getETicketUseCase: asFunction(GetETicketUseCase).singleton(),
    payBookingUseCase: asFunction(PayBookingUseCase).singleton(),
  });
}
