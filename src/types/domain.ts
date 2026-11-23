export const WORKSPACE_ID = 'creps-urca' as const;
export const BOOTSTRAPPED_ADMIN_EMAIL = 'tiago.rodrigues2933@gmail.com' as const;

export type UserRole = 'master' | 'manager';

export const TASK_CATEGORIES = [
  'RH & Equipe',
  'Sistemas & PDV',
  'Financeiro & Bancos',
  'Estoque & Inventário',
  'Jurídico & Contábil',
  'Operacional',
] as const;
export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const TASK_STATUSES = ['pendente', 'em_andamento', 'concluido'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['baixa', 'media', 'alta', 'urgente'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const PAID_BY_OPTIONS = ['Tiago', 'Letícia', 'Empresa Creps Urca'] as const;
export type PaidByOption = (typeof PAID_BY_OPTIONS)[number];

export const PAYMENT_CATEGORIES = [
  'Equipamentos & PDV',
  'RH & Exames',
  'Taxas & Registros',
  'Estoque Inicial',
  'Reforma & Estrutura',
  'Serviços & Sistemas',
  'Outros',
] as const;
export type PaymentCategory = (typeof PAYMENT_CATEGORIES)[number];

export const PAYMENT_METHODS = [
  'PIX',
  'Cartão Corporativo',
  'Transferência',
  'Boleto',
  'Dinheiro',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['pago', 'agendado'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

// Synchronized verbatim with firebase-blueprint.json bounds
export const VALIDATION_LIMITS = {
  ID_REGEX: /^[a-zA-Z0-9_-]+$/,
  ISO_DATE_REGEX: /^\d{4}-\d{2}-\d{2}$/,
  DISPLAY_NAME_MIN: 2,
  DISPLAY_NAME_MAX: 80,
  EMAIL_MIN: 5,
  EMAIL_MAX: 150,
  TASK_TITLE_MIN: 2,
  TASK_TITLE_MAX: 140,
  TASK_DESC_MAX: 1000,
  PAYMENT_DESC_MIN: 2,
  PAYMENT_DESC_MAX: 160,
  PAYMENT_AMOUNT_MAX: 10000000,
  RECEIPT_REF_MAX: 120,
  NOTES_MAX: 600,
  AUDIT_SUMMARY_MAX: 300,
} as const;

export interface UserProfile {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  active: boolean;
  createdByUid: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface TransitionTask {
  id: string;
  workspaceId: typeof WORKSPACE_ID;
  title: string;
  description: string;
  category: TaskCategory;
  assigneeName: string;
  dueDate: string;
  status: TaskStatus;
  priority: TaskPriority;
  completedAt: string;
  createdByUid: string;
  createdByName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  hasPendingWrites?: boolean;
}

export interface TransitionPayment {
  id: string;
  workspaceId: typeof WORKSPACE_ID;
  description: string;
  amount: number;
  paidBy: PaidByOption;
  category: PaymentCategory;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  status: PaymentStatus;
  receiptRef: string;
  notes: string;
  createdByUid: string;
  createdByName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  hasPendingWrites?: boolean;
}

export interface AuditLog {
  id: string;
  workspaceId: typeof WORKSPACE_ID;
  entityType: 'task' | 'payment' | 'user' | 'system';
  entityId: string;
  action: 'create' | 'update' | 'delete';
  summary: string;
  actorUid: string;
  actorEmail: string;
  actorName: string;
  changedFields: string[];
  amount: number;
  source: 'client_atomic_batch' | 'cloud_function_trigger';
  timestamp?: unknown;
}

export interface RealtimeAlert {
  id: string;
  title: string;
  message: string;
  kind: 'urgent' | 'payment' | 'task' | 'system';
  createdAt: number;
  read: boolean;
}

export function sanitizeText(value: string, maxLength: number): string {
  return value.trim().slice(0, maxLength);
}

export function validateTaskPayload(input: {
  title: string;
  description: string;
  category: TaskCategory;
  assigneeName: string;
  dueDate: string;
  status: TaskStatus;
  priority: TaskPriority;
}): string | null {
  const title = input.title.trim();
  const assignee = input.assigneeName.trim();
  if (title.length < VALIDATION_LIMITS.TASK_TITLE_MIN || title.length > VALIDATION_LIMITS.TASK_TITLE_MAX) {
    return `O título da atividade deve ter entre ${VALIDATION_LIMITS.TASK_TITLE_MIN} e ${VALIDATION_LIMITS.TASK_TITLE_MAX} caracteres.`;
  }
  if (input.description.trim().length > VALIDATION_LIMITS.TASK_DESC_MAX) {
    return `A descrição deve ter no máximo ${VALIDATION_LIMITS.TASK_DESC_MAX} caracteres.`;
  }
  if (assignee.length < VALIDATION_LIMITS.DISPLAY_NAME_MIN || assignee.length > VALIDATION_LIMITS.DISPLAY_NAME_MAX) {
    return `O responsável deve ter entre ${VALIDATION_LIMITS.DISPLAY_NAME_MIN} e ${VALIDATION_LIMITS.DISPLAY_NAME_MAX} caracteres.`;
  }
  if (!VALIDATION_LIMITS.ISO_DATE_REGEX.test(input.dueDate)) {
    return 'Informe uma data limite válida no formato AAAA-MM-DD.';
  }
  if (!TASK_CATEGORIES.includes(input.category)) return 'Categoria inválida.';
  if (!TASK_STATUSES.includes(input.status)) return 'Status inválido.';
  if (!TASK_PRIORITIES.includes(input.priority)) return 'Prioridade inválida.';
  return null;
}

export function validatePaymentPayload(input: {
  description: string;
  amount: number;
  paidBy: PaidByOption;
  category: PaymentCategory;
  paymentMethod: PaymentMethod;
  paymentDate: string;
  status: PaymentStatus;
  receiptRef: string;
  notes: string;
}): string | null {
  const desc = input.description.trim();
  if (desc.length < VALIDATION_LIMITS.PAYMENT_DESC_MIN || desc.length > VALIDATION_LIMITS.PAYMENT_DESC_MAX) {
    return `A descrição do pagamento deve ter entre ${VALIDATION_LIMITS.PAYMENT_DESC_MIN} e ${VALIDATION_LIMITS.PAYMENT_DESC_MAX} caracteres.`;
  }
  if (!Number.isFinite(input.amount) || input.amount <= 0 || input.amount > VALIDATION_LIMITS.PAYMENT_AMOUNT_MAX) {
    return 'Informe um valor financeiro positivo válido.';
  }
  if (!VALIDATION_LIMITS.ISO_DATE_REGEX.test(input.paymentDate)) {
    return 'Informe uma data de pagamento válida.';
  }
  if (!PAID_BY_OPTIONS.includes(input.paidBy)) return 'Pagador inválido.';
  if (!PAYMENT_CATEGORIES.includes(input.category)) return 'Categoria financeira inválida.';
  if (!PAYMENT_METHODS.includes(input.paymentMethod)) return 'Meio de pagamento inválido.';
  if (!PAYMENT_STATUSES.includes(input.status)) return 'Status de pagamento inválido.';
  if (input.receiptRef.trim().length > VALIDATION_LIMITS.RECEIPT_REF_MAX) {
    return `Referência do comprovante deve ter no máximo ${VALIDATION_LIMITS.RECEIPT_REF_MAX} caracteres.`;
  }
  if (input.notes.trim().length > VALIDATION_LIMITS.NOTES_MAX) {
    return `Observações devem ter no máximo ${VALIDATION_LIMITS.NOTES_MAX} caracteres.`;
  }
  return null;
}

export function formatCurrencyBRL(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export function formatDateBR(isoDate: string): string {
  if (!isoDate || !VALIDATION_LIMITS.ISO_DATE_REGEX.test(isoDate)) return isoDate || '—';
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

export function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getDaysUntilDue(dueDate: string): number {
  const today = getTodayIsoDate();
  const [ty, tm, td] = today.split('-').map(Number);
  const [dy, dm, dd] = dueDate.split('-').map(Number);
  const todayUtc = Date.UTC(ty, tm - 1, td);
  const dueUtc = Date.UTC(dy, dm - 1, dd);
  return Math.round((dueUtc - todayUtc) / (1000 * 60 * 60 * 24));
}
