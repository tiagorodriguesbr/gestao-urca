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
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  formatCurrencyBRL,
  sanitizeText,
  validatePaymentPayload,
  validateTaskPayload,
  VALIDATION_LIMITS,
  WORKSPACE_ID,
  type PaidByOption,
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
  entityType: 'task' | 'payment' | 'user' | 'system';
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
        role: 'master' as UserRole,
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
    paidBy: PaidByOption;
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
  const amount = Math.round(input.amount * 100) / 100;

  batch.set(paymentRef, {
    workspaceId: WORKSPACE_ID,
    description,
    amount,
    paidBy: input.paidBy,
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
      summary: `Lançado pagamento "${description}" (${formatCurrencyBRL(amount)}) por ${input.paidBy}`,
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
    paidBy: PaidByOption;
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
  const amount = Math.round(updates.amount * 100) / 100;

  const changedFields: string[] = [];
  if (existingPayment.description !== description) changedFields.push('description');
  if (existingPayment.amount !== amount) changedFields.push('amount');
  if (existingPayment.paidBy !== updates.paidBy) changedFields.push('paidBy');
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
    paidBy: updates.paidBy,
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
  }
): Promise<void> {
  const userRef = doc(db, 'users', input.uid);
  const auditRef = doc(collection(db, 'audit_logs'));
  const batch = writeBatch(db);

  const displayName = sanitizeText(input.displayName, VALIDATION_LIMITS.DISPLAY_NAME_MAX);
  const email = sanitizeText(input.email, VALIDATION_LIMITS.EMAIL_MAX);

  batch.set(userRef, {
    uid: input.uid,
    email,
    displayName,
    role: input.role,
    active: true,
    createdByUid: actor.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(
    auditRef,
    buildAuditDoc({
      entityType: 'user',
      entityId: input.uid,
      action: 'create',
      summary: `Criado acesso ${input.role === 'master' ? 'Administrador Master' : 'Gerente de Loja'} para ${displayName} (${email})`,
      actor,
      changedFields: ['email', 'displayName', 'role', 'active'],
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
    active: boolean;
  }
): Promise<void> {
  const userRef = doc(db, 'users', target.uid);
  const auditRef = doc(collection(db, 'audit_logs'));
  const batch = writeBatch(db);

  const displayName = sanitizeText(updates.displayName, VALIDATION_LIMITS.DISPLAY_NAME_MAX);
  const changedFields: string[] = [];
  if (target.displayName !== displayName) changedFields.push('displayName');
  if (target.role !== updates.role) changedFields.push('role');
  if (target.active !== updates.active) changedFields.push('active');
  if (changedFields.length === 0) changedFields.push('updatedAt');

  batch.update(userRef, {
    displayName,
    role: updates.role,
    active: updates.active,
    updatedAt: serverTimestamp(),
  });

  batch.set(
    auditRef,
    buildAuditDoc({
      entityType: 'user',
      entityId: target.uid,
      action: 'update',
      summary: `Atualizado perfil de ${displayName}: perfil ${updates.role === 'master' ? 'Master' : 'Gerente'} · ${updates.active ? 'Ativo' : 'Suspenso'}`,
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
  const auditRef = doc(collection(db, 'audit_logs'));
  const batch = writeBatch(db);

  batch.delete(userRef);
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
        'Conferir tokens, chaves PIX e alçadas de aprovação conjunta para Tiago e Letícia na conta jurídica da Creps Urca.',
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
