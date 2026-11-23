import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EmailAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  sendEmailVerification,
  signOut,
  updatePassword,
  type User,
} from 'firebase/auth';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import {
  BarChart3,
  Bell,
  CheckSquare,
  CreditCard,
  History,
  KeyRound,
  LayoutDashboard,
  LogOut,
  MailCheck,
  Menu,
  Moon,
  Package,
  RefreshCw,
  Sun,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import {
  createInventoryItemWithAudit,
  createInventoryPeriodWithItemsAndAudit,
  createPaymentWithAudit,
  createTaskWithAudit,
  createUserProfileWithAudit,
  deleteInventoryItemWithAudit,
  deletePaymentWithAudit,
  deleteTaskWithAudit,
  deleteUserProfileWithAudit,
  ensureBootstrappedAdminProfile,
  importStarterChecklistPack,
  reviewInventoryPeriodWithAudit,
  saveInventoryBatchCountsWithAudit,
  submitInventoryForValidationWithAudit,
  syncInventoryBaseFromPreviousMonthWithAudit,
  updateInventoryPeriodDatesAndValidationWithAudit,
  updatePaymentWithAudit,
  updateTaskWithAudit,
  updateUserProfileWithAudit,
} from './lib/firestoreService';
import {
  canUseBrowserNotifications,
  isUrgentTask,
  requestBrowserNotificationPermission,
  sendBrowserPushNotification,
} from './lib/notifications';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  formatCurrencyBRL,
  formatMonthKeyBR,
  GERENTE_VIEWABLE_TABS,
  isFullAdminRole,
  normalizeUserRole,
  USER_ROLE_LABELS,
  WORKSPACE_ID,
  type AuditLog,
  type GerenteEditableTab,
  type GerenteViewableTab,
  type InventoryItem,
  type InventoryPeriod,
  type PartnerRecord,
  type RealtimeAlert,
  type TransitionPayment,
  type TransitionTask,
  type UserProfile,
} from './types/domain';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ConfirmActionModal, type ConfirmDialogState } from './components/ConfirmActionModal';
import { LoginView } from './components/LoginView';
import { DashboardView } from './components/DashboardView';
import { ChecklistView } from './components/ChecklistView';
import { PaymentsView } from './components/PaymentsView';
import { InventoryView } from './components/InventoryView';
import { ReportsView } from './components/ReportsView';
import { AuditLogsView } from './components/AuditLogsView';
import { TeamUsersView } from './components/TeamUsersView';

type AppTab =
  | 'dashboard'
  | 'checklist'
  | 'payments'
  | 'inventory'
  | 'reports'
  | 'audit'
  | 'team';

const TAB_TITLES: Record<AppTab, string> = {
  dashboard: 'Visão Geral',
  checklist: 'Checklist de Transição',
  payments: 'Pagamentos Realizados',
  inventory: 'Inventário de Estoque',
  reports: 'Relatórios & Exportação',
  audit: 'Logs de Auditoria',
  team: 'Equipe & Acessos',
};

function MainShell() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    const saved = window.localStorage.getItem('creps-urca-theme');
    if (saved === 'dark' || saved === 'light') return saved;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    window.localStorage.setItem('creps-urca-theme', theme);
  }, [theme]);

  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  useEffect(() => {
    const onUp = () => setIsOnline(true);
    const onDown = () => setIsOnline(false);
    window.addEventListener('online', onUp);
    window.addEventListener('offline', onDown);
    return () => {
      window.removeEventListener('online', onUp);
      window.removeEventListener('offline', onDown);
    };
  }, []);

  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [needsEmailVerification, setNeedsEmailVerification] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const [accessDeniedMessage, setAccessDeniedMessage] = useState<string | null>(null);

  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState<string | null>(null);
  const [pwdBusy, setPwdBusy] = useState(false);

  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [alertsDrawerOpen, setAlertsDrawerOpen] = useState(false);

  const [tasks, setTasks] = useState<TransitionTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(true);
  const [payments, setPayments] = useState<TransitionPayment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [partners, setPartners] = useState<PartnerRecord[]>([]);
  const [inventoryPeriods, setInventoryPeriods] = useState<InventoryPeriod[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(true);
  const [teamUsers, setTeamUsers] = useState<UserProfile[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

  const [alerts, setAlerts] = useState<RealtimeAlert[]>([]);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(() => (canUseBrowserNotifications() ? Notification.permission : 'unsupported'));

  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const [triggerCreateTask, setTriggerCreateTask] = useState(false);
  const [triggerCreatePayment, setTriggerCreatePayment] = useState(false);

  const tasksInitializedRef = useRef(false);
  const paymentsInitializedRef = useRef(false);
  const inventoryPeriodsInitializedRef = useRef(false);
  const urgentPushSentRef = useRef(false);

  const pushAlert = useCallback(
    (item: Omit<RealtimeAlert, 'id' | 'createdAt' | 'read'>, sendPush: boolean) => {
      const alertObj: RealtimeAlert = {
        ...item,
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        createdAt: Date.now(),
        read: false,
      };
      setAlerts((prev) => [alertObj, ...prev].slice(0, 30));
      if (sendPush) {
        sendBrowserPushNotification(item.title, item.message, alertObj.id);
      }
    },
    []
  );

  // Auth Bootstrap & Real-time Profile Guard
  useEffect(() => {
    let unsubProfile: (() => void) | null = null;

    const unsubAuth = onAuthStateChanged(auth, async (fbUser) => {
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      if (!fbUser) {
        setFirebaseUser(null);
        setUserProfile(null);
        setNeedsEmailVerification(false);
        setAuthReady(true);
        tasksInitializedRef.current = false;
        paymentsInitializedRef.current = false;
        inventoryPeriodsInitializedRef.current = false;
        urgentPushSentRef.current = false;
        return;
      }

      setFirebaseUser(fbUser);
      setAccessDeniedMessage(null);
      setNeedsEmailVerification(false);

      try {
        if (
          fbUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase() &&
          !fbUser.emailVerified
        ) {
          setNeedsEmailVerification(true);
          setAuthReady(true);
          return;
        }

        const bootstrapped = await ensureBootstrappedAdminProfile(fbUser);
        if (!bootstrapped) {
          setAccessDeniedMessage(
            'Esta conta não possui acesso autorizado ao workspace da Creps Urca. Solicite cadastro a um Sócio ou Diretor.'
          );
          await signOut(auth);
          setAuthReady(true);
          return;
        }
        if (!bootstrapped.active) {
          setAccessDeniedMessage(
            'Seu acesso está temporariamente suspenso. Contate um Sócio ou Diretor.'
          );
          await signOut(auth);
          setAuthReady(true);
          return;
        }
        setUserProfile(bootstrapped);
        setAuthReady(true);

        unsubProfile = onSnapshot(
          doc(db, 'users', fbUser.uid),
          (snap) => {
            if (!snap.exists()) {
              void signOut(auth);
              return;
            }
            const data = snap.data() as Omit<UserProfile, 'id'>;
            if (!data.active) {
              setAccessDeniedMessage('Seu acesso foi desativado por um Sócio ou Diretor.');
              void signOut(auth);
              return;
            }
            setUserProfile({ id: snap.id, ...data });
          },
          (error) => handleFirestoreError(error, OperationType.GET, `users/${fbUser.uid}`)
        );
      } catch (err) {
        console.error(err);
        setAuthReady(true);
      }
    });

    return () => {
      unsubAuth();
      if (unsubProfile) unsubProfile();
    };
  }, []);

  const normalizedRole = useMemo(
    () => normalizeUserRole(userProfile?.role),
    [userProfile?.role]
  );

  const isFullAdmin = useMemo(() => {
    if (!userProfile || !firebaseUser || !userProfile.active) return false;
    if (isFullAdminRole(userProfile.role)) return true;
    return (
      firebaseUser.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase() &&
      firebaseUser.emailVerified
    );
  }, [userProfile, firebaseUser]);

  const gerenteAllowedTabs = useMemo<GerenteViewableTab[]>(() => {
    if (isFullAdmin) return [...GERENTE_VIEWABLE_TABS];
    if (userProfile?.allowedTabs && userProfile.allowedTabs.length > 0) {
      return userProfile.allowedTabs;
    }
    if (userProfile?.role === 'manager') {
      return ['dashboard', 'checklist', 'payments', 'reports'];
    }
    return ['checklist', 'inventory'];
  }, [isFullAdmin, userProfile]);

  const canViewTab = useCallback(
    (tab: AppTab): boolean => {
      if (isFullAdmin) return true;
      if (tab === 'audit' || tab === 'team') return false;
      return gerenteAllowedTabs.includes(tab);
    },
    [isFullAdmin, gerenteAllowedTabs]
  );

  const canEditTab = useCallback(
    (tab: GerenteEditableTab): boolean => {
      if (isFullAdmin) return true;
      if (normalizedRole !== 'gerente') return false;
      return Boolean(userProfile?.editableTabs?.includes(tab));
    },
    [isFullAdmin, normalizedRole, userProfile?.editableTabs]
  );

  // Redirect away from disallowed tabs if permissions change live
  useEffect(() => {
    if (!userProfile) return;
    if (!canViewTab(activeTab)) {
      const firstAllowed = GERENTE_VIEWABLE_TABS.find((t) => canViewTab(t));
      if (firstAllowed) setActiveTab(firstAllowed);
    }
  }, [userProfile, activeTab, canViewTab]);

  // Firestore Real-time Listeners
  useEffect(() => {
    if (!authReady || !firebaseUser || !userProfile?.active) {
      setTasks([]);
      setPayments([]);
      setPartners([]);
      setInventoryPeriods([]);
      setInventoryItems([]);
      setAuditLogs([]);
      setTeamUsers([]);
      return;
    }

    setTasksLoading(true);
    const tasksQuery = query(
      collection(db, 'tasks'),
      where('workspaceId', '==', WORKSPACE_ID)
    );
    const unsubTasks = onSnapshot(
      tasksQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        const list: TransitionTask[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<TransitionTask, 'id'>),
          hasPendingWrites: d.metadata.hasPendingWrites,
        }));
        setTasks(list);
        setTasksLoading(false);

        if (!tasksInitializedRef.current) {
          tasksInitializedRef.current = true;
          const urgent = list.filter((t) => isUrgentTask(t));
          if (urgent.length > 0 && !urgentPushSentRef.current) {
            urgentPushSentRef.current = true;
            pushAlert(
              {
                kind: 'urgent',
                title: `${urgent.length} atividade(s) com prazo urgente`,
                message: `Ex.: "${urgent[0].title}" vence em breve ou está atrasada.`,
              },
              true
            );
          }
        } else {
          snapshot.docChanges().forEach((change) => {
            if (change.type === 'added' && !change.doc.metadata.hasPendingWrites) {
              const data = change.doc.data() as TransitionTask;
              pushAlert(
                {
                  kind: 'task',
                  title: 'Nova atividade no checklist',
                  message: `"${data.title}" atribuída a ${data.assigneeName}`,
                },
                true
              );
            }
          });
        }
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'tasks')
    );

    setPaymentsLoading(true);
    const paymentsQuery = query(
      collection(db, 'payments'),
      where('workspaceId', '==', WORKSPACE_ID)
    );
    const unsubPayments = onSnapshot(
      paymentsQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        const list: TransitionPayment[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<TransitionPayment, 'id'>),
          hasPendingWrites: d.metadata.hasPendingWrites,
        }));
        setPayments(list);
        setPaymentsLoading(false);

        if (!paymentsInitializedRef.current) {
          paymentsInitializedRef.current = true;
        } else {
          snapshot.docChanges().forEach((change) => {
            const data = change.doc.data() as TransitionPayment;
            if (change.type === 'added') {
              pushAlert(
                {
                  kind: 'payment',
                  title: 'Nova transação financeira',
                  message: `${data.paidBy} registrou ${formatCurrencyBRL(data.amount)} · ${data.description}`,
                },
                true
              );
            } else if (change.type === 'modified') {
              pushAlert(
                {
                  kind: 'payment',
                  title: 'Pagamento atualizado',
                  message: `${data.description} (${formatCurrencyBRL(data.amount)})`,
                },
                true
              );
            }
          });
        }
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'payments')
    );

    const partnersQuery = query(
      collection(db, 'partners'),
      where('workspaceId', '==', WORKSPACE_ID)
    );
    const unsubPartners = onSnapshot(
      partnersQuery,
      (snapshot) => {
        const list: PartnerRecord[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<PartnerRecord, 'id'>),
        }));
        setPartners(list);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'partners')
    );

    const inventoryPeriodsQuery = query(
      collection(db, 'inventory_periods'),
      where('workspaceId', '==', WORKSPACE_ID)
    );
    const unsubInventoryPeriods = onSnapshot(
      inventoryPeriodsQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        const list: InventoryPeriod[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<InventoryPeriod, 'id'>),
          hasPendingWrites: d.metadata.hasPendingWrites,
        }));
        setInventoryPeriods(list);

        if (!inventoryPeriodsInitializedRef.current) {
          inventoryPeriodsInitializedRef.current = true;
          if (isFullAdmin) {
            const awaiting = list.filter((p) => p.status === 'aguardando_validacao');
            if (awaiting.length > 0) {
              pushAlert(
                {
                  kind: 'inventory',
                  title: `${awaiting.length} inventário(s) aguardando validação`,
                  message: `Mês ${formatMonthKeyBR(awaiting[0].monthKey)} enviado por ${awaiting[0].submittedByName || 'equipe'} aguarda aprovação de Sócio/Diretor.`,
                },
                true
              );
            }
          }
        } else if (isFullAdmin) {
          snapshot.docChanges().forEach((change) => {
            const data = change.doc.data() as InventoryPeriod;
            if (
              (change.type === 'added' || change.type === 'modified') &&
              data.status === 'aguardando_validacao'
            ) {
              pushAlert(
                {
                  kind: 'inventory',
                  title: `Validação de Inventário (${formatMonthKeyBR(data.monthKey)})`,
                  message: `${data.submittedByName || 'Equipe'} enviou o inventário para aprovação de Sócios e Diretores.`,
                },
                true
              );
            }
          });
        }
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'inventory_periods')
    );

    setInventoryLoading(true);
    const inventoryQuery = query(
      collection(db, 'inventory_items'),
      where('workspaceId', '==', WORKSPACE_ID)
    );
    const unsubInventoryItems = onSnapshot(
      inventoryQuery,
      { includeMetadataChanges: true },
      (snapshot) => {
        const list: InventoryItem[] = snapshot.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<InventoryItem, 'id'>),
          hasPendingWrites: d.metadata.hasPendingWrites,
        }));
        setInventoryItems(list);
        setInventoryLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, 'inventory_items')
    );

    let unsubAudit: (() => void) | null = null;
    let unsubUsers: (() => void) | null = null;

    if (isFullAdmin) {
      setAuditLoading(true);
      const auditQuery = query(
        collection(db, 'audit_logs'),
        where('workspaceId', '==', WORKSPACE_ID),
        limit(120)
      );
      unsubAudit = onSnapshot(
        auditQuery,
        (snapshot) => {
          const list: AuditLog[] = snapshot.docs
            .map((d) => ({
              id: d.id,
              ...(d.data() as Omit<AuditLog, 'id'>),
            }))
            .sort((a, b) => {
              const ta =
                typeof (a.timestamp as { toMillis?: () => number })?.toMillis === 'function'
                  ? (a.timestamp as { toMillis: () => number }).toMillis()
                  : 0;
              const tb =
                typeof (b.timestamp as { toMillis?: () => number })?.toMillis === 'function'
                  ? (b.timestamp as { toMillis: () => number }).toMillis()
                  : 0;
              return tb - ta;
            });
          setAuditLogs(list);
          setAuditLoading(false);
        },
        (error) => handleFirestoreError(error, OperationType.LIST, 'audit_logs')
      );

      setUsersLoading(true);
      unsubUsers = onSnapshot(
        collection(db, 'users'),
        (snapshot) => {
          const list: UserProfile[] = snapshot.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<UserProfile, 'id'>),
          }));
          setTeamUsers(list);
          setUsersLoading(false);
        },
        (error) => handleFirestoreError(error, OperationType.LIST, 'users')
      );
    } else {
      setAuditLogs([]);
      setTeamUsers([]);
      setAuditLoading(false);
      setUsersLoading(false);
    }

    return () => {
      unsubTasks();
      unsubPayments();
      unsubPartners();
      unsubInventoryPeriods();
      unsubInventoryItems();
      if (unsubAudit) unsubAudit();
      if (unsubUsers) unsubUsers();
    };
  }, [authReady, firebaseUser, userProfile?.active, isFullAdmin, pushAlert]);

  const urgentTasksCount = useMemo(
    () => tasks.filter((t) => isUrgentTask(t)).length,
    [tasks]
  );

  const pendingInventoryValidationsCount = useMemo(
    () =>
      isFullAdmin
        ? inventoryPeriods.filter((p) => p.status === 'aguardando_validacao').length
        : 0,
    [isFullAdmin, inventoryPeriods]
  );

  const unreadAlertsCount = useMemo(
    () => alerts.filter((a) => !a.read).length,
    [alerts]
  );

  const actor = useMemo(
    () => ({
      uid: firebaseUser?.uid || '',
      email: userProfile?.email || firebaseUser?.email || '',
      displayName: userProfile?.displayName || firebaseUser?.displayName || 'Administrador',
    }),
    [firebaseUser, userProfile]
  );

  const requestConfirmation = useCallback((dialog: Omit<ConfirmDialogState, 'open'>) => {
    setConfirmDialog({ ...dialog, open: true });
  }, []);

  const handleConfirmExecute = async () => {
    if (!confirmDialog) return;
    setConfirmBusy(true);
    try {
      await confirmDialog.onConfirm();
      setConfirmDialog(null);
    } catch {
      // Keep error surfaced via child modal or ErrorBoundary
    } finally {
      setConfirmBusy(false);
    }
  };

  const handleEnablePush = async () => {
    const res = await requestBrowserNotificationPermission();
    setNotificationPermission(res);
    if (res === 'granted') {
      sendBrowserPushNotification(
        'Creps Urca — Alertas Ativados',
        'Você receberá notificações em tempo real de transações e prazos urgentes.'
      );
    }
  };

  const handleCheckEmailVerification = async () => {
    if (!auth.currentUser) return;
    setVerifyBusy(true);
    setVerifyMessage(null);
    try {
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true);
      const refreshed = auth.currentUser;
      if (refreshed.emailVerified) {
        const profile = await ensureBootstrappedAdminProfile(refreshed);
        if (profile) {
          setNeedsEmailVerification(false);
          setUserProfile(profile);
        }
      } else {
        setVerifyMessage(
          'Ainda não identificamos a confirmação do link. Abra o e-mail enviado e clique no link de verificação.'
        );
      }
    } catch {
      setVerifyMessage('Não foi possível verificar agora. Tente novamente em instantes.');
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleResendVerification = async () => {
    if (!auth.currentUser) return;
    setVerifyBusy(true);
    setVerifyMessage(null);
    try {
      await sendEmailVerification(auth.currentUser);
      setVerifyMessage(`Novo link de verificação enviado para ${auth.currentUser.email}.`);
    } catch {
      setVerifyMessage('Aguarde alguns instantes antes de solicitar outro e-mail.');
    } finally {
      setVerifyBusy(false);
    }
  };

  const handleChangeOwnPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !auth.currentUser.email) return;
    setPwdError(null);
    setPwdSuccess(null);
    if (newPwd.length < 6) {
      setPwdError('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }
    setPwdBusy(true);
    try {
      const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPwd);
      await reauthenticateWithCredential(auth.currentUser, credential);
      await updatePassword(auth.currentUser, newPwd);
      setPwdSuccess('Senha alterada com sucesso.');
      setCurrentPwd('');
      setNewPwd('');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setPwdError('Senha atual incorreta.');
      } else {
        setPwdError('Não foi possível alterar a senha. Verifique os dados informados.');
      }
    } finally {
      setPwdBusy(false);
    }
  };

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center">
        <div className="text-sm font-medium text-slate-500 dark:text-slate-400">
          Verificando sessão segura...
        </div>
      </div>
    );
  }

  if (firebaseUser && needsEmailVerification) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-3 text-teal-700 dark:text-teal-400">
            <MailCheck className="w-6 h-6 shrink-0" />
            <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
              Confirme seu e-mail para continuar
            </h2>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Para proteger a conta principal do Diretor, enviamos um link de confirmação para{' '}
            <strong className="font-mono text-xs">{firebaseUser.email}</strong>. Clique no link do e-mail e depois aperte o botão abaixo.
          </p>
          {verifyMessage && (
            <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200">
              {verifyMessage}
            </div>
          )}
          <div className="space-y-2.5">
            <button
              type="button"
              disabled={verifyBusy}
              onClick={() => void handleCheckEmailVerification()}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold transition-colors disabled:opacity-60"
            >
              <RefreshCw className="w-4 h-4" />
              Já confirmei o e-mail — Entrar
            </button>
            <button
              type="button"
              disabled={verifyBusy}
              onClick={() => void handleResendVerification()}
              className="w-full py-2.5 px-4 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Reenviar e-mail de confirmação
            </button>
            <button
              type="button"
              onClick={() => void signOut(auth)}
              className="w-full py-2 px-4 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              Voltar ao login
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!firebaseUser || !userProfile) {
    return (
      <LoginView
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        accessDeniedMessage={accessDeniedMessage}
      />
    );
  }

  const navItems: Array<{
    id: AppTab;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard },
    { id: 'checklist', label: 'Checklist', icon: CheckSquare },
    { id: 'payments', label: 'Pagamentos', icon: CreditCard },
    { id: 'inventory', label: 'Inventário', icon: Package },
    { id: 'reports', label: 'Relatórios', icon: BarChart3 },
    { id: 'audit', label: 'Auditoria', icon: History },
    { id: 'team', label: 'Equipe', icon: Users },
  ];

  const visibleNavItems = navItems.filter((item) => canViewTab(item.id));
  const showQuickPaymentBtn = activeTab === 'payments' && canEditTab('payments');
  const showQuickTaskBtn = activeTab !== 'payments' && canEditTab('checklist');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Mobile Sidebar Backdrop */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-950/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-40 h-screen w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col justify-between transition-transform duration-200 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-5 space-y-6">
          <div className="flex items-center justify-between">
            <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap">
              Creps Urca
            </span>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              aria-label="Fechar menu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <nav className="space-y-1" aria-label="Navegação principal">
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-300'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <span className="flex items-center gap-3">
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </span>
                  {item.id === 'checklist' && urgentTasksCount > 0 && (
                    <span className="font-mono tabular-nums text-xs text-amber-700 dark:text-amber-400 font-semibold">
                      {urgentTasksCount}
                    </span>
                  )}
                  {item.id === 'inventory' && pendingInventoryValidationsCount > 0 && (
                    <span className="font-mono tabular-nums text-xs text-amber-700 dark:text-amber-400 font-semibold">
                      {pendingInventoryValidationsCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Account & Offline Summary Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
          {!isOnline && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-200">
              <WifiOff className="w-3.5 h-3.5 shrink-0" />
              <span>Modo offline · Sincronizará ao reconectar</span>
            </div>
          )}

          <div className="px-1 space-y-0.5">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {userProfile.displayName}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {USER_ROLE_LABELS[normalizedRole]}
            </p>
          </div>

          <div className="space-y-2">
            <button
              type="button"
              onClick={() => {
                setPwdError(null);
                setPwdSuccess(null);
                setCurrentPwd('');
                setNewPwd('');
                setPasswordModalOpen(true);
              }}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <KeyRound className="w-3.5 h-3.5" />
              Alterar Senha
            </button>

            <button
              type="button"
              onClick={() => void signOut(auth)}
              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sair da Conta
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Clean 3-Zone Top Bar */}
        <header className="sticky top-0 z-20 h-14 px-4 sm:px-6 lg:px-8 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Abrir menu"
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="hidden sm:inline text-slate-400 dark:text-slate-500">
                Creps Urca
              </span>
              <span className="hidden sm:inline text-slate-300 dark:text-slate-700">/</span>
              <h1 className="font-display font-semibold text-slate-900 dark:text-slate-100 truncate">
                {TAB_TITLES[activeTab]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              onClick={() => {
                setAlertsDrawerOpen((prev) => !prev);
                setAlerts((prev) => prev.map((a) => ({ ...a, read: true })));
              }}
              aria-label="Notificações e alertas urgentes"
              className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Bell className="w-4 h-4" />
              {(unreadAlertsCount > 0 ||
                urgentTasksCount > 0 ||
                pendingInventoryValidationsCount > 0) && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-amber-600 text-white font-mono text-[10px] font-bold flex items-center justify-center">
                  {unreadAlertsCount ||
                    urgentTasksCount + pendingInventoryValidationsCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
              aria-label="Alternar tema"
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {(showQuickPaymentBtn || showQuickTaskBtn) && (
              <button
                type="button"
                onClick={() => {
                  if (showQuickPaymentBtn) {
                    setTriggerCreatePayment(true);
                  } else {
                    setActiveTab('checklist');
                    setTriggerCreateTask(true);
                  }
                }}
                className="hidden sm:inline-flex items-center px-3.5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                {showQuickPaymentBtn ? 'Novo Pagamento' : 'Nova Atividade'}
              </button>
            )}
          </div>
        </header>

        {/* Real-Time Alerts & Push Drawer */}
        {alertsDrawerOpen && (
          <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 sm:px-6 lg:px-8 py-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Central de Alertas em Tempo Real
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Prazos urgentes (48h) e notificações instantâneas de transações financeiras
                </p>
              </div>
              <div className="flex items-center gap-2">
                {notificationPermission !== 'granted' &&
                  notificationPermission !== 'unsupported' && (
                    <button
                      type="button"
                      onClick={() => void handleEnablePush()}
                      className="px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium transition-colors whitespace-nowrap"
                    >
                      Ativar Push no Navegador
                    </button>
                  )}
                {notificationPermission === 'granted' && (
                  <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                    Push ativo no navegador
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setAlertsDrawerOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {alerts.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                Nenhum alerta recente nesta sessão. Novas transações ou prazos urgentes aparecerão aqui em tempo real.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto">
                {alerts.slice(0, 8).map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2 font-semibold text-slate-800 dark:text-slate-200">
                      <span>{item.title}</span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {new Date(item.createdAt).toLocaleTimeString('pt-BR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-slate-600 dark:text-slate-400 mt-1">{item.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Viewport Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {activeTab === 'dashboard' && canViewTab('dashboard') && (
            <DashboardView
              tasks={tasks}
              payments={payments}
              partners={partners}
              isFullAdmin={isFullAdmin}
              canEditPayments={canEditTab('payments')}
              onNavigate={(tab) => setActiveTab(tab)}
              onOpenNewPayment={() => {
                setActiveTab('payments');
                setTriggerCreatePayment(true);
              }}
            />
          )}

          {activeTab === 'checklist' && canViewTab('checklist') && (
            <ChecklistView
              tasks={tasks}
              loading={tasksLoading}
              canEdit={canEditTab('checklist')}
              onCreateTask={async (input) => {
                await createTaskWithAudit(actor, input);
              }}
              onUpdateTask={async (existing, updates) => {
                await updateTaskWithAudit(actor, existing, updates);
              }}
              onDeleteTask={async (task) => {
                await deleteTaskWithAudit(actor, task);
              }}
              onImportStarter={async () => {
                await importStarterChecklistPack(actor);
              }}
              requestConfirmation={requestConfirmation}
              externalOpenCreate={triggerCreateTask}
              onConsumeExternalOpenCreate={() => setTriggerCreateTask(false)}
            />
          )}

          {activeTab === 'payments' && canViewTab('payments') && (
            <PaymentsView
              payments={payments}
              partners={partners}
              loading={paymentsLoading}
              canEdit={canEditTab('payments')}
              onCreatePayment={async (input) => {
                await createPaymentWithAudit(actor, input);
              }}
              onUpdatePayment={async (existing, updates) => {
                await updatePaymentWithAudit(actor, existing, updates);
              }}
              onDeletePayment={async (payment) => {
                await deletePaymentWithAudit(actor, payment);
              }}
              requestConfirmation={requestConfirmation}
              externalOpenCreate={triggerCreatePayment}
              onConsumeExternalOpenCreate={() => setTriggerCreatePayment(false)}
            />
          )}

          {activeTab === 'inventory' && canViewTab('inventory') && (
            <InventoryView
              periods={inventoryPeriods}
              items={inventoryItems}
              loading={inventoryLoading}
              canEdit={canEditTab('inventory')}
              isFullAdmin={isFullAdmin}
              onCreatePeriod={async (input) =>
                createInventoryPeriodWithItemsAndAudit(actor, input)
              }
              onUpdateDatesAndValidation={async (period, input) => {
                await updateInventoryPeriodDatesAndValidationWithAudit(actor, period, input);
              }}
              onSyncBaseFromPrev={async (targetPeriod, targetItems, prevPeriod, prevItems) =>
                syncInventoryBaseFromPreviousMonthWithAudit(
                  actor,
                  targetPeriod,
                  targetItems,
                  prevPeriod,
                  prevItems
                )
              }
              onSubmitForValidation={async (period) => {
                await submitInventoryForValidationWithAudit(actor, period);
              }}
              onReviewPeriod={async (period, input) => {
                await reviewInventoryPeriodWithAudit(actor, period, input);
              }}
              onSaveBatchCounts={async (period, updates) => {
                await saveInventoryBatchCountsWithAudit(actor, period, updates);
              }}
              onCreateItem={async (period, input) => {
                await createInventoryItemWithAudit(actor, period, input);
              }}
              onDeleteItem={async (period, item) => {
                await deleteInventoryItemWithAudit(actor, period, item);
              }}
              requestConfirmation={requestConfirmation}
            />
          )}

          {activeTab === 'reports' && canViewTab('reports') && (
            <ReportsView
              tasks={tasks}
              payments={payments}
              partners={partners}
              auditLogs={auditLogs}
              isFullAdmin={isFullAdmin}
            />
          )}

          {activeTab === 'audit' && isFullAdmin && (
            <AuditLogsView logs={auditLogs} loading={auditLoading} />
          )}

          {activeTab === 'team' && isFullAdmin && (
            <TeamUsersView
              users={teamUsers}
              currentUserUid={firebaseUser.uid}
              loading={usersLoading}
              onRegisterUserProfile={async (input) => {
                await createUserProfileWithAudit(actor, input);
              }}
              onUpdateUserProfile={async (target, updates) => {
                await updateUserProfileWithAudit(actor, target, updates);
              }}
              onDeleteUserProfile={async (target) => {
                await deleteUserProfileWithAudit(actor, target);
              }}
              requestConfirmation={requestConfirmation}
            />
          )}
        </main>
      </div>

      <ConfirmActionModal
        dialog={confirmDialog}
        busy={confirmBusy}
        onClose={() => {
          if (!confirmBusy) setConfirmDialog(null);
        }}
      />

      {passwordModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Alterar Minha Senha
              </h3>
              <button
                type="button"
                onClick={() => setPasswordModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={(e) => void handleChangeOwnPassword(e)} className="p-5 space-y-4">
              {pwdError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                  {pwdError}
                </div>
              )}
              {pwdSuccess && (
                <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300">
                  {pwdSuccess}
                </div>
              )}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Senha atual
                </label>
                <input
                  type="password"
                  required
                  value={currentPwd}
                  onChange={(e) => setCurrentPwd(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Nova senha (mínimo 6 caracteres)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                />
              </div>
              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setPasswordModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Fechar
                </button>
                <button
                  type="submit"
                  disabled={pwdBusy}
                  className="px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold disabled:opacity-60"
                >
                  {pwdBusy ? 'Salvando...' : 'Atualizar Senha'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MainShell />
    </ErrorBoundary>
  );
}
