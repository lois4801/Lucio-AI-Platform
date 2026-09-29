// Global feedback layer — the platform previously swallowed dozens of request
// failures with `.catch(() => {})`, so a broken scan/save/import looked like
// "nothing happened". These helpers surface failures (and key successes) as
// toasts. Background/polling refreshes should stay silent on purpose.
import { toast } from 'sonner';

export function notifyError(err: unknown, context?: string) {
  const message = err instanceof Error ? err.message : String(err);
  toast.error(context ? `${context} failed` : 'Something went wrong', {
    description: message.slice(0, 240),
  });
}

export function notifySuccess(message: string, description?: string) {
  toast.success(message, description ? { description: description.slice(0, 240) } : undefined);
}
