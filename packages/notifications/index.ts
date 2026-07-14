export {
  type DispatchNotificationError,
  type DispatchNotificationResult,
  dispatchNotification,
  type NotificationDispatchDatabase,
} from "./src/dispatch";
export {
  type EmailQueueServiceError,
  enqueueNotificationEmail,
  preferencesUrl,
} from "./src/email-queue-service";
export {
  getUnreadCount,
  invalidateUnreadCount,
  listForUser,
  listRecentUnread,
  markAllAsRead,
  markAsRead,
  type NotificationFilters,
  type NotificationListItem,
  type NotificationPagination,
  type NotificationServiceError,
} from "./src/notification-service";
export {
  listPreferences,
  type NotificationPreferenceRow,
  type PreferencesServiceError,
  shouldDeliverToChannel,
  upsertPreference,
} from "./src/preferences-service";
export {
  type NotificationSseEvent,
  notificationSseChannel,
  pollNotificationStream,
  publishNotificationEvent,
  publishOrganisationNotificationEvent,
  streamKey,
} from "./src/sse/broker";
export {
  categoryLabel,
  emailTemplateForType,
  getDefaultChannels,
  getTypeConfig,
  isKnownNotificationType,
  listAllTypes,
  listKnownNotificationTypes,
  type NotificationCategory,
  type NotificationTypeConfig,
} from "./src/types/notification-type-registry";
