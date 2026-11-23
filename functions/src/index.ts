import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

initializeApp();

const db = getFirestore('ai-studio-d66f2262-5512-45ba-9cb9-7318c7b14bc5');

function diffKeys(beforeData: Record<string, unknown> | undefined, afterData: Record<string, unknown> | undefined): string[] {
  const keys = new Set([
    ...Object.keys(beforeData ?? {}),
    ...Object.keys(afterData ?? {}),
  ]);
  const changed: string[] = [];
  for (const key of keys) {
    if (key === 'updatedAt' || key === 'createdAt') continue;
    if (JSON.stringify(beforeData?.[key]) !== JSON.stringify(afterData?.[key])) {
      changed.push(key);
    }
  }
  return changed.slice(0, 20);
}

export const auditTaskWrites = onDocumentWritten(
  {
    document: 'tasks/{taskId}',
    database: 'ai-studio-d66f2262-5512-45ba-9cb9-7318c7b14bc5',
    region: 'southamerica-east1',
  },
  async (event) => {
    const beforeData = event.data?.before.data() as Record<string, unknown> | undefined;
    const afterData = event.data?.after.data() as Record<string, unknown> | undefined;
    const action = !beforeData ? 'create' : !afterData ? 'delete' : 'update';
    const title = String(afterData?.title ?? beforeData?.title ?? event.params.taskId);

    await db.collection('audit_logs').add({
      workspaceId: 'creps-urca',
      entityType: 'task',
      entityId: event.params.taskId,
      action,
      summary: `[Cloud Function] Tarefa "${title}" (${action})`,
      actorUid: String(afterData?.createdByUid ?? beforeData?.createdByUid ?? 'system'),
      actorEmail: 'cloud-function@creps-urca.internal',
      actorName: String(afterData?.createdByName ?? beforeData?.createdByName ?? 'Cloud Functions'),
      changedFields: diffKeys(beforeData, afterData),
      amount: 0,
      source: 'cloud_function_trigger',
      timestamp: FieldValue.serverTimestamp(),
    });
  }
);

export const auditPaymentWrites = onDocumentWritten(
  {
    document: 'payments/{paymentId}',
    database: 'ai-studio-d66f2262-5512-45ba-9cb9-7318c7b14bc5',
    region: 'southamerica-east1',
  },
  async (event) => {
    const beforeData = event.data?.before.data() as Record<string, unknown> | undefined;
    const afterData = event.data?.after.data() as Record<string, unknown> | undefined;
    const action = !beforeData ? 'create' : !afterData ? 'delete' : 'update';
    const description = String(afterData?.description ?? beforeData?.description ?? event.params.paymentId);
    const amount = Number(afterData?.amount ?? beforeData?.amount ?? 0);

    await db.collection('audit_logs').add({
      workspaceId: 'creps-urca',
      entityType: 'payment',
      entityId: event.params.paymentId,
      action,
      summary: `[Cloud Function] Pagamento "${description}" - R$ ${amount.toFixed(2)} (${action})`,
      actorUid: String(afterData?.createdByUid ?? beforeData?.createdByUid ?? 'system'),
      actorEmail: 'cloud-function@creps-urca.internal',
      actorName: String(afterData?.createdByName ?? beforeData?.createdByName ?? 'Cloud Functions'),
      changedFields: diffKeys(beforeData, afterData),
      amount,
      source: 'cloud_function_trigger',
      timestamp: FieldValue.serverTimestamp(),
    });
  }
);
