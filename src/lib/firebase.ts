import { deleteApp, getApps, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  sendEmailVerification,
  signOut,
  updateProfile,
} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);

function createFirestoreInstance(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = createFirestoreInstance();
export const auth = getAuth(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function getFirestoreErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  try {
    const info = JSON.parse(message) as Partial<FirestoreErrorInfo>;
    if (typeof info.error === 'string') {
      return `${info.error}${info.path ? ` (${info.operationType}: ${info.path})` : ''}`;
    }
  } catch {
    return message;
  }
  return message;
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

/**
 * Provisions a new Firebase Auth user (Email + Password) using an isolated
 * secondary Firebase App instance so the active Master Admin session stays signed in.
 */
export async function provisionAuthUserViaSecondaryApp(
  email: string,
  password: string,
  displayName: string,
  createProfile: (uid: string) => Promise<void>
): Promise<string> {
  const secondaryName = `CrepsUrcaUserProvisioner_${Date.now()}`;
  const secondaryApp = initializeApp(firebaseConfig, secondaryName);
  const secondaryAuth = getAuth(secondaryApp);

  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    try {
      await updateProfile(cred.user, { displayName });
      await createProfile(cred.user.uid);
    } catch (error) {
      try {
        await deleteUser(cred.user);
      } catch (cleanupError) {
        console.error('Failed to remove Auth user after profile creation failed', cleanupError);
        throw new Error(
          `O cadastro do perfil falhou e não foi possível remover a conta Auth ${cred.user.uid}.`
        );
      }
      throw error;
    }

    try {
      await sendEmailVerification(cred.user);
    } catch (error) {
      console.error('Failed to send verification email for new user', error);
    }
    return cred.user.uid;
  } finally {
    try {
      await signOut(secondaryAuth);
    } catch (error) {
      console.error('Failed to sign out secondary Firebase Auth app', error);
    }
    try {
      await deleteApp(secondaryApp);
    } catch (error) {
      console.error('Failed to dispose secondary Firebase App', error);
    }
  }
}
