// Interface publik modul notification (PLAN §3.2.5).
export { registerNotificationRoutes } from "./notification.routes.ts";
export {
  configureNotification,
  forgetRecipient,
  MAX_EMAIL_ATTEMPTS,
  type NotifyInput,
  type NotifyResult,
  notify,
  type Recipient,
  retryEmailOutbox,
} from "./notification.service.ts";
