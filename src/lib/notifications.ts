import { getDaysUntilDue, type TransitionTask } from '../types/domain';

export function isUrgentTask(task: TransitionTask): boolean {
  if (task.status === 'concluido') return false;
  const days = getDaysUntilDue(task.dueDate);
  return days <= 2 || task.priority === 'urgente';
}

export function getDeadlineBadgeLabel(task: TransitionTask): {
  label: string;
  tone: 'overdue' | 'urgent' | 'soon' | 'normal' | 'done';
} {
  if (task.status === 'concluido') {
    return { label: 'Concluída', tone: 'done' };
  }
  const days = getDaysUntilDue(task.dueDate);
  if (days < 0) {
    const abs = Math.abs(days);
    return { label: `Atrasada ${abs}d`, tone: 'overdue' };
  }
  if (days === 0) {
    return { label: 'Vence hoje', tone: 'urgent' };
  }
  if (days <= 2) {
    return { label: `Vence em ${days}d`, tone: 'urgent' };
  }
  if (days <= 5) {
    return { label: `Em ${days} dias`, tone: 'soon' };
  }
  return { label: `Em ${days} dias`, tone: 'normal' };
}

export function canUseBrowserNotifications(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!canUseBrowserNotifications()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function sendBrowserPushNotification(title: string, body: string, tag?: string): void {
  if (!canUseBrowserNotifications()) return;
  if (Notification.permission !== 'granted') return;
  try {
    new Notification(title, {
      body,
      tag: tag || `creps-urca-${Date.now()}`,
      silent: false,
    });
  } catch {
    // Ignore environments that restrict Notification constructor inside sandboxed iframes
  }
}
