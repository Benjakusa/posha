import type { NotificationCategory } from './notification-store.js';

export type NotificationTemplateKey =
  | 'ticket.confirmed'
  | 'room.starting'
  | 'request.updated'
  | 'payout.status_changed'
  | 'safety.notice'
  | 'legal.notice';

export interface NotificationTemplate {
  key: NotificationTemplateKey;
  category: NotificationCategory;
  subject: string;
  body: string;
}

export const NOTIFICATION_TEMPLATES: Readonly<
  Record<NotificationTemplateKey, NotificationTemplate>
> = {
  'ticket.confirmed': {
    key: 'ticket.confirmed',
    category: 'ticket_confirmation',
    subject: 'Your POSHA ticket is confirmed',
    body: 'Your ticket is confirmed. Open POSHA to view your booking details.',
  },
  'room.starting': {
    key: 'room.starting',
    category: 'room_starting',
    subject: 'A POSHA room is starting',
    body: 'A room you booked is starting soon. Open POSHA to view the details.',
  },
  'request.updated': {
    key: 'request.updated',
    category: 'request_update',
    subject: 'Your POSHA request has an update',
    body: 'There is an update to your request. Open POSHA to review it.',
  },
  'payout.status_changed': {
    key: 'payout.status_changed',
    category: 'payout_status',
    subject: 'Your POSHA payout status changed',
    body: 'Your payout status changed. Sign in to POSHA to view the details.',
  },
  'safety.notice': {
    key: 'safety.notice',
    category: 'safety_notice',
    subject: 'An important POSHA safety notice',
    body: 'We have an important safety notice for you. Sign in to POSHA to review it.',
  },
  'legal.notice': {
    key: 'legal.notice',
    category: 'legal_notice',
    subject: 'An important POSHA account notice',
    body: 'We have an important account notice for you. Sign in to POSHA to review it.',
  },
};

export function isEssentialCategory(category: NotificationCategory): boolean {
  return category === 'safety_notice' || category === 'legal_notice';
}
