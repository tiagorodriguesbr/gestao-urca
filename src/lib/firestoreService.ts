import {
  collection,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore';
import { type User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from './firebase';
import { RESTAURANT_INVENTORY_SEED } from '../data/restaurantInventorySeed';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  formatCurrencyBRL,
  formatDateBR,
  formatMonthKeyBR,
  GERENTE_EDITABLE_TABS,
  GERENTE_VIEWABLE_TABS,
  sanitizeText,
  USER_ROLE_LABELS,
  validateInventoryItemPayload,
  validatePaymentPayload,
  validateTaskPayload,
  VALIDATION_LIMITS,
  WORKSPACE_ID,
  type GerenteEditableTab,
  type GerenteViewableTab,
  type InventoryCategory,
  type InventoryItem,
  type InventoryPeriod,
  type PaymentCategory,
  type PaymentMethod,
  type PaymentStatus,
  type TaskCategory,
  type TaskPriority,
  type TaskStatus,
  type TransitionPayment,
  type TransitionTask,
  type UserProfile,
  type UserRole,
} from '../types/domain';

interface ActorContext {
  uid: string;
  email: string;
  displayName: string;
}

function buildAuditDoc(params: {
  entityType: 'task' | 'payment' | 'user' | 'inventory' | 'partner' | 'system';
  entityId: string;
  action: 'create' | 'update' | 'delete';
  summary: string;
  actor: ActorContext;
  changedFields: string[];
  amount?: number;
}) {
  return {
    workspaceId: WORKSPACE_ID,
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    summary: sanitizeText(params.summary, VALIDATION_LIMITS.AUDIT_SUMMARY_MAX),
    actorUid: params.actor.uid,
    actorEmail: sanitizeText(params.actor.email || 'admin@crepsurca.com', VALIDATION_LIMITS.EMAIL_MAX),
    actorName: sanitizeText(params.actor.displayName || 'Administrador', VALIDATION_LIMITS.DISPLAY_NAME_MAX),
    changedFields: params.changedFields.slice(0, 20),
    amount: Number(params.amount ?? 0),
    source: 'client_atomic_batch' as const,
    timestamp: serverTimestamp(),
  };
}

export async function ensureBootstrappedAdminProfile(firebaseUser: User): Promise<UserProfile | null> {
  const path = `users/${firebaseUser.uid}`;
  try {
    const userRef = doc(db, 'users', firebaseUser.uid);
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      const data = snap.data() as Omit<UserProfile, 'id'>;
      return { id: snap.id, ...data };
    }

    if (
      firebaseUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase() &&
      firebaseUser.emailVerified
    ) {
      const profilePayload = {
        uid: firebaseUser.uid,
        email: sanitizeText(firebaseUser.email, VALIDATION_LIMITS.EMAIL_MAX),
        displayName: sanitizeText(firebaseUser.displayName || 'Tiago Rodrigues', VALIDATION_LIMITS.DISPLAY_NAME_MAX),
        role: 'diretor' as UserRole,
        allowedTabs: [...GERENTE_VIEWABLE_TABS],
        editableTabs: [...GERENTE_EDITABLE_TABS],
        active: true,
        createdByUid: firebaseUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      await setDoc(userRef, profilePayload);
      return { id: firebaseUser.uid, ...profilePayload };
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function createTaskWithAudit(
  actor: ActorContext,
  input: {
    title: string;
    description: string;
    category: TaskCategory;
    assigneeName: string;
    dueDate: string;
    status: TaskStatus;
    priority: TaskPriority;
  }
): Promise<string> {
  const err = validateTaskPayload(input);
  if (err) throw new Error(err);

  const taskRef = doc(collection(db, 'tasks'));
  const auditRef = doc(collection(db, 'audit_logs'));
  const batch = writeBatch(db);

  const title = sanitizeText(input.title, VALIDATION_LIMITS.TASK_TITLE_MAX);
  const completedAt = input.status === 'concluido' ? new Date().toISOString() : '';

  batch.set(taskRef, {
    workspaceId: WORKSPACE_ID,
    title,
    description: sanitizeText(input.description, VALIDATION_LIMITS.TASK_DESC_MAX),
    category: input.category,
    assigneeName: sanitizeText(input.assigneeName, VALIDATION_LIMITS.DISPLAY_NAME_MAX),
    dueDate: input.dueDate,
    status: input.status,
    priority: input.priority,
    completedAt,
    createdByUid: actor.uid,
    createdByName: sanitizeText(actor.displayName, VALIDATION_LIMITS.DISPLAY_NAME_MAX),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(
    auditRef,
    buildAuditDoc({
      entityType: 'task',
      entityId: taskRef.id,
      action: 'create',
      summary: `Criada atividade "${title}" para ${input.assigneeName} (prazo ${input.dueDate})`,
      actor,
      changedFields: ['title', 'category', 'assigneeName', 'dueDate', 'status', 'priority'],
    })
  );

  try {
    await batch.commit();
    return taskRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `tasks/${taskRef.id}`);
  }
}

export async function updateTaskWithAudit(
  actor: ActorContext,
  existingTask: TransitionTask,
  updates: {
    title: string;
    description: string;
    category: TaskCategory;
    assigneeName: string;
    dueDate: string;
    status: TaskStatus;
    priority: TaskPriority;
  }
): Promise<void> {
  const err = validateTaskPayload(updates);
  if (err) throw new Error(err);

  const taskRef = doc(db, 'tasks', existingTask.id);
  const auditRef = doc(collection(db, 'audit_logs'));
  const batch = writeBatch(db);

  const title = sanitizeText(updates.title, VALIDATION_LIMITS.TASK_TITLE_MAX);
  const completedAt =
    updates.status === 'concluido'
      ? existingTask.completedAt || new Date().toISOString()
      : '';

  const changedFields: string[] = [];
  if (existingTask.title !== title) changedFields.push('title');
  if (existingTask.description !== updates.description.trim()) changedFields.push('description');
  if (existingTask.category !== updates.category) changedFields.push('category');
  if (existingTask.assigneeName !== updates.assigneeName.trim()) changedFields.push('assigneeName');
  if (existingTask.dueDate !== updates.dueDate) changedFields.push('dueDate');
  if (existingTask.status !== updates.status) changedFields.push('status');
  if (existingTask.priority !== updates.priority) changedFields.push('priority');
  if (changedFields.length === 0) changedFields.push('updatedAt');

  batch.update(taskRef, {
    title,
    description: sanitizeText(updates.description, VALIDATION_LIMITS.TASK_DESC_MAX),
    category: updates.category,
    assigneeName: sanitizeText(updates.assigneeName, VALIDATION_LIMITS.DISPLAY_NAME_MAX),
    dueDate: updates.dueDate,
    status: updates.status,
    priority: updates.priority,
    completedAt,
    updatedAt: serverTimestamp(),
  });

  batch.set(
    auditRef,
    buildAuditDoc({
      entityType: 'task',
      entityId: existingTask.id,
      action: 'update',
      summary: `Atualizada atividade "${title}" (${updates.status})`,
      actor,
      changedFields,
    })
  );

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `tasks/${existingTask.id}`);
  }
}

export async function deleteTaskWithAudit(
  actor: ActorContext,
  task: TransitionTask
): Promise<void> {
  const taskRef = doc(db, 'tasks', task.id);
  const auditRef = doc(collection(db, 'audit_logs'));
  const batch = writeBatch(db);

  batch.delete(taskRef);
  batch.set(
    auditRef,
    buildAuditDoc({
      entityType: 'task',
      entityId: task.id,
      action: 'delete',
      summary: `Excluída atividade "${task.title}" (responsável: ${task.assigneeName})`,
      actor,
      changedFields: ['deleted'],
    })
  );

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `tasks/${task.id}`);
  }
}

export async function createPaymentWithAudit(
  actor: ActorContext,
  input: {
    description: string;
    amount: number;
    paidBy: string;
    category: PaymentCategory;
    paymentMethod: PaymentMethod;
    paymentDate: string;
    status: PaymentStatus;
    receiptRef: string;
    notes: string;
  }
): Promise<string> {
  const err = validatePaymentPayload(input);
  if (err) throw new Error(err);

  const paymentRef = doc(collection(db, 'payments'));
  const auditRef = doc(collection(db, 'audit_logs'));
  const batch = writeBatch(db);

  const description = sanitizeText(input.description, VALIDATION_LIMITS.PAYMENT_DESC_MAX);
  const paidBy = sanitizeText(input.paidBy, VALIDATION_LIMITS.DISPLAY_NAME_MAX);
  const amount = Math.round(input.amount * 100) / 100;

  batch.set(paymentRef, {
    workspaceId: WORKSPACE_ID,
    description,
    amount,
    paidBy,
    category: input.category,
    paymentMethod: input.paymentMethod,
    paymentDate: input.paymentDate,
    status: input.status,
    receiptRef: sanitizeText(input.receiptRef, VALIDATION_LIMITS.RECEIPT_REF_MAX),
    notes: sanitizeText(input.notes, VALIDATION_LIMITS.NOTES_MAX),
    createdByUid: actor.uid,
    createdByName: sanitizeText(actor.displayName, VALIDATION_LIMITS.DISPLAY_NAME_MAX),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(
    auditRef,
    buildAuditDoc({
      entityType: 'payment',
      entityId: paymentRef.id,
      action: 'create',
      summary: `Lançado pagamento "${description}" (${formatCurrencyBRL(amount)}) por ${paidBy}`,
      actor,
      changedFields: ['description', 'amount', 'paidBy', 'category', 'paymentDate', 'status'],
      amount,
    })
  );

  try {
    await batch.commit();
    return paymentRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `payments/${paymentRef.id}`);
  }
}

export async function updatePaymentWithAudit(
  actor: ActorContext,
  existingPayment: TransitionPayment,
  updates: {
    description: string;
    amount: number;
    paidBy: string;
    category: PaymentCategory;
    paymentMethod: PaymentMethod;
    paymentDate: string;
    status: PaymentStatus;
    receiptRef: string;
    notes: string;
  }
): Promise<void> {
  const err = validatePaymentPayload(updates);
  if (err) throw new Error(err);

  const paymentRef = doc(db, 'payments', existingPayment.id);
  const auditRef = doc(collection(db, 'audit_logs'));
  const batch = writeBatch(db);

  const description = sanitizeText(updates.description, VALIDATION_LIMITS.PAYMENT_DESC_MAX);
  const paidBy = sanitizeText(updates.paidBy, VALIDATION_LIMITS.DISPLAY_NAME_MAX);
  const amount = Math.round(updates.amount * 100) / 100;

  const changedFields: string[] = [];
  if (existingPayment.description !== description) changedFields.push('description');
  if (existingPayment.amount !== amount) changedFields.push('amount');
  if (existingPayment.paidBy !== paidBy) changedFields.push('paidBy');
  if (existingPayment.category !== updates.category) changedFields.push('category');
  if (existingPayment.paymentMethod !== updates.paymentMethod) changedFields.push('paymentMethod');
  if (existingPayment.paymentDate !== updates.paymentDate) changedFields.push('paymentDate');
  if (existingPayment.status !== updates.status) changedFields.push('status');
  if (existingPayment.receiptRef !== updates.receiptRef.trim()) changedFields.push('receiptRef');
  if (existingPayment.notes !== updates.notes.trim()) changedFields.push('notes');
  if (changedFields.length === 0) changedFields.push('updatedAt');

  batch.update(paymentRef, {
    description,
    amount,
    paidBy,
    category: updates.category,
    paymentMethod: updates.paymentMethod,
    paymentDate: updates.paymentDate,
    status: updates.status,
    receiptRef: sanitizeText(updates.receiptRef, VALIDATION_LIMITS.RECEIPT_REF_MAX),
    notes: sanitizeText(updates.notes, VALIDATION_LIMITS.NOTES_MAX),
    updatedAt: serverTimestamp(),
  });

  batch.set(
    auditRef,
    buildAuditDoc({
      entityType: 'payment',
      entityId: existingPayment.id,
      action: 'update',
      summary: `Alterado pagamento "${description}" (${formatCurrencyBRL(amount)})`,
      actor,
      changedFields,
      amount,
    })
  );

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `payments/${existingPayment.id}`);
  }
}

export async function deletePaymentWithAudit(
  actor: ActorContext,
  payment: TransitionPayment
): Promise<void> {
  const paymentRef = doc(db, 'payments', payment.id);
  const auditRef = doc(collection(db, 'audit_logs'));
  const batch = writeBatch(db);

  batch.delete(paymentRef);
  batch.set(
    auditRef,
    buildAuditDoc({
      entityType: 'payment',
      entityId: payment.id,
      action: 'delete',
      summary: `Removido pagamento "${payment.description}" (${formatCurrencyBRL(payment.amount)})`,
      actor,
      changedFields: ['deleted'],
      amount: payment.amount,
    })
  );

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `payments/${payment.id}`);
  }
}

export async function createUserProfileWithAudit(
  actor: ActorContext,
  input: {
    uid: string;
    email: string;
    displayName: string;
    role: UserRole;
    allowedTabs: GerenteViewableTab[];
    editableTabs: GerenteEditableTab[];
  }
): Promise<void> {
  const userRef = doc(db, 'users', input.uid);
  const partnerRef = doc(db, 'partners', input.uid);
  const auditRef = doc(collection(db, 'audit_logs'));
  const batch = writeBatch(db);

  const displayName = sanitizeText(input.displayName, VALIDATION_LIMITS.DISPLAY_NAME_MAX);
  const email = sanitizeText(input.email, VALIDATION_LIMITS.EMAIL_MAX);
  const allowedTabs =
    input.role === 'gerente' ? input.allowedTabs : [...GERENTE_VIEWABLE_TABS];
  const editableTabs =
    input.role === 'gerente'
      ? input.editableTabs.filter((t) => allowedTabs.includes(t))
      : [...GERENTE_EDITABLE_TABS];

  batch.set(userRef, {
    uid: input.uid,
    email,
    displayName,
    role: input.role,
    allowedTabs,
    editableTabs,
    active: true,
    createdByUid: actor.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  if (input.role === 'socio') {
    batch.set(partnerRef, {
      workspaceId: WORKSPACE_ID,
      uid: input.uid,
      displayName,
      active: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  batch.set(
    auditRef,
    buildAuditDoc({
      entityType: 'user',
      entityId: input.uid,
      action: 'create',
      summary: `Criado acesso ${USER_ROLE_LABELS[input.role]} para ${displayName} (${email})`,
      actor,
      changedFields: ['email', 'displayName', 'role', 'allowedTabs', 'editableTabs', 'active'],
    })
  );

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `users/${input.uid}`);
  }
}

export async function updateUserProfileWithAudit(
  actor: ActorContext,
  target: UserProfile,
  updates: {
    displayName: string;
    role: UserRole;
    allowedTabs: GerenteViewableTab[];
    editableTabs: GerenteEditableTab[];
    active: boolean;
  }
): Promise<void> {
  const userRef = doc(db, 'users', target.uid);
  const partnerRef = doc(db, 'partners', target.uid);
  const auditRef = doc(collection(db, 'audit_logs'));
  const batch = writeBatch(db);

  const displayName = sanitizeText(updates.displayName, VALIDATION_LIMITS.DISPLAY_NAME_MAX);
  const allowedTabs =
    updates.role === 'gerente' ? updates.allowedTabs : [...GERENTE_VIEWABLE_TABS];
  const editableTabs =
    updates.role === 'gerente'
      ? updates.editableTabs.filter((t) => allowedTabs.includes(t))
      : [...GERENTE_EDITABLE_TABS];
  let partnerExists = false;
  if (updates.role === 'socio') {
    try {
      partnerExists = (await getDoc(partnerRef)).exists();
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `partners/${target.uid}`);
    }
  }

  const changedFields: string[] = [];
  if (target.displayName !== displayName) changedFields.push('displayName');
  if (target.role !== updates.role) changedFields.push('role');
  if (target.active !== updates.active) changedFields.push('active');
  changedFields.push('allowedTabs', 'editableTabs');

  batch.update(userRef, {
    displayName,
    role: updates.role,
    allowedTabs,
    editableTabs,
    active: updates.active,
    updatedAt: serverTimestamp(),
  });

  if (updates.role === 'socio') {
    if (partnerExists) {
      batch.update(partnerRef, {
        displayName,
        active: updates.active,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.set(partnerRef, {
        workspaceId: WORKSPACE_ID,
        uid: target.uid,
        displayName,
        active: updates.active,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } else {
    batch.delete(partnerRef);
  }

  batch.set(
    auditRef,
    buildAuditDoc({
      entityType: 'user',
      entityId: target.uid,
      action: 'update',
      summary: `Atualizado perfil de ${displayName}: ${USER_ROLE_LABELS[updates.role]} · ${updates.active ? 'Ativo' : 'Suspenso'}`,
      actor,
      changedFields,
    })
  );

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${target.uid}`);
  }
}

export async function deleteUserProfileWithAudit(
  actor: ActorContext,
  target: UserProfile
): Promise<void> {
  const userRef = doc(db, 'users', target.uid);
  const partnerRef = doc(db, 'partners', target.uid);
  const auditRef = doc(collection(db, 'audit_logs'));
  const batch = writeBatch(db);

  batch.delete(userRef);
  batch.delete(partnerRef);
  batch.set(
    auditRef,
    buildAuditDoc({
      entityType: 'user',
      entityId: target.uid,
      action: 'delete',
      summary: `Removido acesso de ${target.displayName} (${target.email})`,
      actor,
      changedFields: ['deleted'],
    })
  );

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `users/${target.uid}`);
  }
}

export async function createInventoryPeriodWithItemsAndAudit(
  actor: ActorContext,
  input: {
    monthKey: string;
    baseDate: string;
    currentDate: string;
    carryFrom?: { period: InventoryPeriod; items: InventoryItem[] } | null;
  }
): Promise<string> {
  if (!VALIDATION_LIMITS.MONTH_KEY_REGEX.test(input.monthKey)) {
    throw new Error('Informe um mês válido no formato AAAA-MM.');
  }
  if (input.baseDate && !VALIDATION_LIMITS.ISO_DATE_REGEX.test(input.baseDate)) {
    throw new Error('Data Base do inventário inválida.');
  }
  if (input.currentDate && !VALIDATION_LIMITS.ISO_DATE_REGEX.test(input.currentDate)) {
    throw new Error('Data Hoje do inventário inválida.');
  }

  const periodId = `${WORKSPACE_ID}_${input.monthKey}`;
  const periodRef = doc(db, 'inventory_periods', periodId);
  let periodAlreadyExists: boolean;
  try {
    periodAlreadyExists = (await getDoc(periodRef)).exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `inventory_periods/${periodId}`);
  }
  if (periodAlreadyExists) {
    throw new Error(`O inventário de ${formatMonthKeyBR(input.monthKey)} já foi iniciado.`);
  }

  const carriedFromMonth = input.carryFrom?.period.monthKey || '';
  const effectiveBaseDate = input.baseDate || input.carryFrom?.period.currentDate || '';

  const seedRows =
    input.carryFrom && input.carryFrom.items.length > 0
      ? [...input.carryFrom.items]
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((item, idx) => ({
            name: item.name,
            category: item.category,
            unit: item.unit,
            baseQty: Math.round(item.currentQty * 1000) / 1000,
            currentQty: 0,
            notes: '',
            sortOrder: idx + 1,
          }))
      : RESTAURANT_INVENTORY_SEED.map((item, idx) => ({
          name: item.name,
          category: item.category,
          unit: item.unit,
          baseQty: 0,
          currentQty: 0,
          notes: '',
          sortOrder: idx + 1,
        }));

  const chunkSize = 400;
  const itemChunks: typeof seedRows[] = [];
  for (let i = 0; i < seedRows.length; i += chunkSize) {
    itemChunks.push(seedRows.slice(i, i + chunkSize));
  }
  if (itemChunks.length === 0) {
    itemChunks.push([]);
  }

  for (let cIdx = 0; cIdx < itemChunks.length; cIdx++) {
    const chunk = itemChunks[cIdx];
    const batch = writeBatch(db);

    if (cIdx === 0) {
      batch.set(periodRef, {
        workspaceId: WORKSPACE_ID,
        monthKey: input.monthKey,
        baseDate: effectiveBaseDate,
        currentDate: input.currentDate || '',
        baseValidated: false,
        currentValidated: false,
        status: 'rascunho',
        submittedByUid: '',
        submittedByName: '',
        submittedAtIso: '',
        reviewedByUid: '',
        reviewedByName: '',
        reviewedAtIso: '',
        rejectionReason: '',
        carriedFromMonth,
        createdByUid: actor.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const auditRef = doc(collection(db, 'audit_logs'));
      batch.set(
        auditRef,
        buildAuditDoc({
          entityType: 'inventory',
          entityId: periodId,
          action: 'create',
          summary: carriedFromMonth
            ? `Iniciado inventário ${formatMonthKeyBR(input.monthKey)} com ${seedRows.length} itens puxando Qtd. Base de ${formatMonthKeyBR(carriedFromMonth)}`
            : `Iniciado inventário ${formatMonthKeyBR(input.monthKey)} com base completa (${seedRows.length} itens)`,
          actor,
          changedFields: ['monthKey', 'baseDate', 'carriedFromMonth'],
        })
      );
    }

    for (const row of chunk) {
      const itemRef = doc(collection(db, 'inventory_items'));
      batch.set(itemRef, {
        workspaceId: WORKSPACE_ID,
        periodId,
        monthKey: input.monthKey,
        name: sanitizeText(row.name, VALIDATION_LIMITS.INVENTORY_NAME_MAX),
        category: row.category,
        unit: sanitizeText(row.unit, VALIDATION_LIMITS.INVENTORY_UNIT_MAX),
        baseQty: row.baseQty,
        currentQty: row.currentQty,
        notes: sanitizeText(row.notes, VALIDATION_LIMITS.INVENTORY_NOTES_MAX),
        sortOrder: row.sortOrder,
        createdByUid: actor.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(
        error,
        OperationType.WRITE,
        `inventory_periods/${periodId}, inventory_items, audit_logs`
      );
    }
  }

  return periodId;
}

export async function updateInventoryPeriodDatesAndValidationWithAudit(
  actor: ActorContext,
  period: InventoryPeriod,
  input: {
    baseDate: string;
    currentDate: string;
    baseValidated: boolean;
    currentValidated: boolean;
  }
): Promise<void> {
  if (period.status === 'aprovado') {
    throw new Error('Este inventário já foi aprovado e bloqueado. Não é possível alterá-lo.');
  }
  if (period.status === 'aguardando_validacao') {
    throw new Error('Este inventário aguarda validação de Sócio ou Diretor.');
  }
  if (input.baseDate && !VALIDATION_LIMITS.ISO_DATE_REGEX.test(input.baseDate)) {
    throw new Error('Data da Quantidade Base inválida.');
  }
  if (input.currentDate && !VALIDATION_LIMITS.ISO_DATE_REGEX.test(input.currentDate)) {
    throw new Error('Data da Quantidade Hoje inválida.');
  }
  if (input.baseValidated && !input.baseDate) {
    throw new Error('Informe a Data da Quantidade Base antes de validá-la.');
  }
  if (input.currentValidated && !input.currentDate) {
    throw new Error('Informe a Data da Quantidade Hoje antes de validá-la.');
  }

  const periodRef = doc(db, 'inventory_periods', period.id);
  const auditRef = doc(collection(db, 'audit_logs'));
  const batch = writeBatch(db);

  batch.update(periodRef, {
    baseDate: input.baseDate,
    currentDate: input.currentDate,
    baseValidated: input.baseValidated,
    currentValidated: input.currentValidated,
    updatedAt: serverTimestamp(),
  });

  batch.set(
    auditRef,
    buildAuditDoc({
      entityType: 'inventory',
      entityId: period.id,
      action: 'update',
      summary: `Datas/validação ${formatMonthKeyBR(period.monthKey)}: Base ${input.baseDate ? formatDateBR(input.baseDate) : '—'} (${input.baseValidated ? 'validada' : 'pendente'}) · Hoje ${input.currentDate ? formatDateBR(input.currentDate) : '—'} (${input.currentValidated ? 'validada' : 'pendente'})`,
      actor,
      changedFields: ['baseDate', 'currentDate', 'baseValidated', 'currentValidated'],
    })
  );

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `inventory_periods/${period.id}`);
  }
}

export async function syncInventoryBaseFromPreviousMonthWithAudit(
  actor: ActorContext,
  targetPeriod: InventoryPeriod,
  targetItems: InventoryItem[],
  prevPeriod: InventoryPeriod,
  prevItems: InventoryItem[]
): Promise<number> {
  if (targetPeriod.status === 'aprovado' || targetPeriod.status === 'aguardando_validacao') {
    throw new Error('Este inventário não está aberto para edição.');
  }

  const prevMap = new Map<string, InventoryItem>();
  for (const item of prevItems) {
    prevMap.set(`${item.category}::${item.name.trim().toLowerCase()}`, item);
  }

  const updates: Array<{ target: InventoryItem; newBaseQty: number }> = [];
  for (const tItem of targetItems) {
    const match = prevMap.get(`${tItem.category}::${tItem.name.trim().toLowerCase()}`);
    if (!match) continue;
    const rounded = Math.round(match.currentQty * 1000) / 1000;
    if (rounded !== tItem.baseQty) {
      updates.push({ target: tItem, newBaseQty: rounded });
    }
  }

  const chunkSize = 400;
  const chunks: typeof updates[] = [];
  for (let i = 0; i < updates.length; i += chunkSize) {
    chunks.push(updates.slice(i, i + chunkSize));
  }
  if (chunks.length === 0) chunks.push([]);

  for (let cIdx = 0; cIdx < chunks.length; cIdx++) {
    const chunk = chunks[cIdx];
    const batch = writeBatch(db);

    if (cIdx === 0) {
      const periodRef = doc(db, 'inventory_periods', targetPeriod.id);
      batch.update(periodRef, {
        baseDate: prevPeriod.currentDate || targetPeriod.baseDate,
        baseValidated: false,
        carriedFromMonth: prevPeriod.monthKey,
        updatedAt: serverTimestamp(),
      });

      const auditRef = doc(collection(db, 'audit_logs'));
      batch.set(
        auditRef,
        buildAuditDoc({
          entityType: 'inventory',
          entityId: targetPeriod.id,
          action: 'update',
          summary: `Puxada Qtd. Base de ${formatMonthKeyBR(targetPeriod.monthKey)} a partir da Qtd. Hoje de ${formatMonthKeyBR(prevPeriod.monthKey)} (${updates.length} itens atualizados)`,
          actor,
          changedFields: ['baseDate', 'baseValidated', 'carriedFromMonth', 'baseQty'],
        })
      );
    }

    for (const row of chunk) {
      batch.update(doc(db, 'inventory_items', row.target.id), {
        baseQty: row.newBaseQty,
        updatedAt: serverTimestamp(),
      });
    }

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `inventory_periods/${targetPeriod.id}`);
    }
  }

  return updates.length;
}

export async function submitInventoryForValidationWithAudit(
  actor: ActorContext,
  period: InventoryPeriod
): Promise<void> {
  if (period.status !== 'rascunho' && period.status !== 'recusado') {
    throw new Error('Somente inventários em preenchimento ou recusados podem ser enviados para validação.');
  }
  if (!VALIDATION_LIMITS.ISO_DATE_REGEX.test(period.baseDate) || !period.baseValidated) {
    throw new Error('Valide a Data e a Quantidade Base antes de enviar para validação.');
  }
  if (!VALIDATION_LIMITS.ISO_DATE_REGEX.test(period.currentDate) || !period.currentValidated) {
    throw new Error('Valide a Data e a Quantidade Hoje antes de enviar para validação.');
  }

  const periodRef = doc(db, 'inventory_periods', period.id);
  const auditRef = doc(collection(db, 'audit_logs'));
  const batch = writeBatch(db);

  batch.update(periodRef, {
    status: 'aguardando_validacao',
    submittedByUid: actor.uid,
    submittedByName: sanitizeText(actor.displayName, VALIDATION_LIMITS.DISPLAY_NAME_MAX),
    submittedAtIso: new Date().toISOString(),
    updatedAt: serverTimestamp(),
  });

  batch.set(
    auditRef,
    buildAuditDoc({
      entityType: 'inventory',
      entityId: period.id,
      action: 'update',
      summary: `Inventário de ${formatMonthKeyBR(period.monthKey)} enviado para validação de Sócios e Diretores`,
      actor,
      changedFields: ['status', 'submittedByUid', 'submittedByName', 'submittedAtIso'],
    })
  );

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `inventory_periods/${period.id}`);
  }
}

export async function reviewInventoryPeriodWithAudit(
  actor: ActorContext,
  period: InventoryPeriod,
  input: {
    decision: 'aprovado' | 'recusado';
    rejectionReason: string;
  }
): Promise<void> {
  if (period.status !== 'aguardando_validacao') {
    throw new Error('Este inventário não está aguardando validação.');
  }

  const cleanReason =
    input.decision === 'recusado'
      ? sanitizeText(
          input.rejectionReason.trim() || 'Ajustes solicitados na revisão.',
          VALIDATION_LIMITS.INVENTORY_REJECTION_MAX
        )
      : '';

  const periodRef = doc(db, 'inventory_periods', period.id);
  const auditRef = doc(collection(db, 'audit_logs'));
  const batch = writeBatch(db);

  batch.update(periodRef, {
    status: input.decision,
    reviewedByUid: actor.uid,
    reviewedByName: sanitizeText(actor.displayName, VALIDATION_LIMITS.DISPLAY_NAME_MAX),
    reviewedAtIso: new Date().toISOString(),
    rejectionReason: cleanReason,
    updatedAt: serverTimestamp(),
  });

  batch.set(
    auditRef,
    buildAuditDoc({
      entityType: 'inventory',
      entityId: period.id,
      action: 'update',
      summary:
        input.decision === 'aprovado'
          ? `Inventário de ${formatMonthKeyBR(period.monthKey)} APROVADO e bloqueado definitivamente`
          : `Inventário de ${formatMonthKeyBR(period.monthKey)} RECUSADO para ajustes (${cleanReason})`,
      actor,
      changedFields: ['status', 'reviewedByUid', 'reviewedByName', 'reviewedAtIso', 'rejectionReason'],
    })
  );

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `inventory_periods/${period.id}`);
  }
}

export async function saveInventoryBatchCountsWithAudit(
  actor: ActorContext,
  period: InventoryPeriod,
  updates: Array<{
    existing: InventoryItem;
    baseQty: number;
    currentQty: number;
    unit: string;
    notes: string;
  }>
): Promise<void> {
  if (period.status !== 'rascunho' && period.status !== 'recusado') {
    throw new Error('Este inventário está bloqueado para alteração.');
  }
  if (updates.length === 0) return;

  const chunks: typeof updates[] = [];
  for (let i = 0; i < updates.length; i += 400) {
    chunks.push(updates.slice(i, i + 400));
  }

  for (const chunk of chunks) {
    const batch = writeBatch(db);
    for (const row of chunk) {
      const err = validateInventoryItemPayload({
        name: row.existing.name,
        category: row.existing.category,
        unit: row.unit,
        baseQty: row.baseQty,
        currentQty: row.currentQty,
        notes: row.notes,
      });
      if (err) throw new Error(`${row.existing.name}: ${err}`);

      const ref = doc(db, 'inventory_items', row.existing.id);
      batch.update(ref, {
        unit: sanitizeText(row.unit, VALIDATION_LIMITS.INVENTORY_UNIT_MAX),
        baseQty: Math.round(row.baseQty * 1000) / 1000,
        currentQty: Math.round(row.currentQty * 1000) / 1000,
        notes: sanitizeText(row.notes, VALIDATION_LIMITS.INVENTORY_NOTES_MAX),
        updatedAt: serverTimestamp(),
      });
    }

    const auditRef = doc(collection(db, 'audit_logs'));
    batch.set(
      auditRef,
      buildAuditDoc({
        entityType: 'inventory',
        entityId: period.id,
        action: 'update',
        summary: `Atualizada contagem de ${chunk.length} item(ns) no inventário (${formatMonthKeyBR(period.monthKey)})`,
        actor,
        changedFields: ['baseQty', 'currentQty', 'unit', 'notes'],
      })
    );

    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'inventory_items');
    }
  }
}

export async function createInventoryItemWithAudit(
  actor: ActorContext,
  period: InventoryPeriod,
  input: {
    name: string;
    category: InventoryCategory;
    unit: string;
    baseQty: number;
    currentQty: number;
    notes: string;
    sortOrder: number;
  }
): Promise<string> {
  if (period.status !== 'rascunho' && period.status !== 'recusado') {
    throw new Error('Este inventário está bloqueado para alteração.');
  }
  const err = validateInventoryItemPayload(input);
  if (err) throw new Error(err);

  const ref = doc(collection(db, 'inventory_items'));
  const auditRef = doc(collection(db, 'audit_logs'));
  const batch = writeBatch(db);

  const name = sanitizeText(input.name, VALIDATION_LIMITS.INVENTORY_NAME_MAX);
  batch.set(ref, {
    workspaceId: WORKSPACE_ID,
    periodId: period.id,
    monthKey: period.monthKey,
    name,
    category: input.category,
    unit: sanitizeText(input.unit, VALIDATION_LIMITS.INVENTORY_UNIT_MAX),
    baseQty: Math.round(input.baseQty * 1000) / 1000,
    currentQty: Math.round(input.currentQty * 1000) / 1000,
    notes: sanitizeText(input.notes, VALIDATION_LIMITS.INVENTORY_NOTES_MAX),
    sortOrder: input.sortOrder,
    createdByUid: actor.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(
    auditRef,
    buildAuditDoc({
      entityType: 'inventory',
      entityId: ref.id,
      action: 'create',
      summary: `Incluído item "${name}" (${input.category}) no inventário ${formatMonthKeyBR(period.monthKey)}`,
      actor,
      changedFields: ['periodId', 'monthKey', 'name', 'category', 'unit', 'baseQty', 'currentQty'],
    })
  );

  try {
    await batch.commit();
    return ref.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `inventory_items/${ref.id}`);
  }
}

export async function deleteInventoryItemWithAudit(
  actor: ActorContext,
  period: InventoryPeriod,
  item: InventoryItem
): Promise<void> {
  if (period.status !== 'rascunho' && period.status !== 'recusado') {
    throw new Error('Este inventário está bloqueado para alteração.');
  }
  const ref = doc(db, 'inventory_items', item.id);
  const auditRef = doc(collection(db, 'audit_logs'));
  const batch = writeBatch(db);

  batch.delete(ref);
  batch.set(
    auditRef,
    buildAuditDoc({
      entityType: 'inventory',
      entityId: item.id,
      action: 'delete',
      summary: `Removido item "${item.name}" (${item.category}) do inventário ${formatMonthKeyBR(period.monthKey)}`,
      actor,
      changedFields: ['deleted'],
    })
  );

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `inventory_items/${item.id}`);
  }
}

export async function importStarterChecklistPack(actor: ActorContext): Promise<void> {
  const addDays = (offset: number): string => {
    const dt = new Date();
    dt.setDate(dt.getDate() + offset);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const starterTasks: Array<{
    title: string;
    description: string;
    category: TaskCategory;
    assigneeName: string;
    dueDate: string;
    status: TaskStatus;
    priority: TaskPriority;
  }> = [
    {
      title: 'Marcar exame admissional dos funcionários',
      description:
        'Agendar ASO admissional de toda a equipe contratada da Creps Urca na clínica de medicina do trabalho e anexar guias.',
      category: 'RH & Equipe',
      assigneeName: 'Letícia',
      dueDate: addDays(1),
      status: 'pendente',
      priority: 'urgente',
    },
    {
      title: 'Levar máquinas da Cielo ou integradora para loja',
      description:
        'Configurar CNPJ novo da Creps Urca nos terminais POS, testar recebimento débito/crédito/VR e validar taxas negociadas.',
      category: 'Sistemas & PDV',
      assigneeName: 'Tiago',
      dueDate: addDays(2),
      status: 'em_andamento',
      priority: 'alta',
    },
    {
      title: 'Criar sistema Gcom com empresa nova',
      description:
        'Solicitar implantação do Gcom vinculado ao novo CNPJ Creps Urca, cadastrar cardápio, NCMs fiscais e certificado A1.',
      category: 'Sistemas & PDV',
      assigneeName: 'Tiago',
      dueDate: addDays(4),
      status: 'pendente',
      priority: 'alta',
    },
    {
      title: 'Validar acesso à conta bancária dos sócios',
      description:
        'Conferir tokens, chaves PIX e alçadas de aprovação conjunta na conta jurídica da Creps Urca.',
      category: 'Financeiro & Bancos',
      assigneeName: 'Letícia',
      dueDate: addDays(1),
      status: 'pendente',
      priority: 'urgente',
    },
    {
      title: 'Realizar inventário físico de transição na loja',
      description:
        'Contagem completa de insumos secos, refrigerados, embalagens e equipamentos antes do fechamento do repasse.',
      category: 'Estoque & Inventário',
      assigneeName: 'Gerente de Loja',
      dueDate: addDays(5),
      status: 'pendente',
      priority: 'alta',
    },
  ];

  const batch = writeBatch(db);
  for (const item of starterTasks) {
    const ref = doc(collection(db, 'tasks'));
    batch.set(ref, {
      workspaceId: WORKSPACE_ID,
      title: item.title,
      description: item.description,
      category: item.category,
      assigneeName: item.assigneeName,
      dueDate: item.dueDate,
      status: item.status,
      priority: item.priority,
      completedAt: '',
      createdByUid: actor.uid,
      createdByName: sanitizeText(actor.displayName, VALIDATION_LIMITS.DISPLAY_NAME_MAX),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  const auditRef = doc(collection(db, 'audit_logs'));
  batch.set(
    auditRef,
    buildAuditDoc({
      entityType: 'system',
      entityId: WORKSPACE_ID,
      action: 'create',
      summary: `Importadas ${starterTasks.length} atividades iniciais da transição Creps Urca`,
      actor,
      changedFields: ['starter_checklist_pack'],
    })
  );

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'tasks');
  }
}
