import React, { useState } from 'react';
import {
  AlertCircle,
  Edit3,
  Plus,
  Shield,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import {
  GERENTE_EDITABLE_TABS,
  GERENTE_VIEWABLE_TABS,
  normalizeUserRole,
  TAB_LABEL_MAP,
  USER_ROLE_LABELS,
  VALIDATION_LIMITS,
  type GerenteEditableTab,
  type GerenteViewableTab,
  type UserProfile,
  type UserRole,
} from '../types/domain';
import {
  getFirestoreErrorMessage,
  provisionAuthUserViaSecondaryApp,
} from '../lib/firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import type { ConfirmDialogState } from './ConfirmActionModal';

interface TeamUsersViewProps {
  users: UserProfile[];
  currentUserUid: string;
  loading: boolean;
  onRegisterUserProfile: (input: {
    uid: string;
    email: string;
    displayName: string;
    role: UserRole;
    allowedTabs: GerenteViewableTab[];
    editableTabs: GerenteEditableTab[];
  }) => Promise<void>;
  onUpdateUserProfile: (
    target: UserProfile,
    updates: {
      displayName: string;
      role: UserRole;
      allowedTabs: GerenteViewableTab[];
      editableTabs: GerenteEditableTab[];
      active: boolean;
    }
  ) => Promise<void>;
  onDeleteUserProfile: (target: UserProfile) => Promise<void>;
  requestConfirmation: (dialog: Omit<ConfirmDialogState, 'open'>) => void;
}

const DEFAULT_GERENTE_VIEW: GerenteViewableTab[] = ['checklist', 'inventory'];
const DEFAULT_GERENTE_EDIT: GerenteEditableTab[] = [];

export const TeamUsersView: React.FC<TeamUsersViewProps> = ({
  users,
  currentUserUid,
  loading,
  onRegisterUserProfile,
  onUpdateUserProfile,
  onDeleteUserProfile,
  requestConfirmation,
}) => {
  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('gerente');
  const [allowedTabs, setAllowedTabs] = useState<GerenteViewableTab[]>(DEFAULT_GERENTE_VIEW);
  const [editableTabs, setEditableTabs] = useState<GerenteEditableTab[]>(DEFAULT_GERENTE_EDIT);
  const [active, setActive] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);
  const [providerHelp, setProviderHelp] = useState(false);

  function openCreate() {
    setEditingUser(null);
    setDisplayName('');
    setEmail('');
    setPassword('');
    setRole('gerente');
    setAllowedTabs([...DEFAULT_GERENTE_VIEW]);
    setEditableTabs([...DEFAULT_GERENTE_EDIT]);
    setActive(true);
    setFormError(null);
    setProviderHelp(false);
    setCreateOpen(true);
  }

  function openEdit(u: UserProfile) {
    const normalizedRole = normalizeUserRole(u.role);
    setEditingUser(u);
    setDisplayName(u.displayName);
    setEmail(u.email);
    setPassword('');
    setRole(normalizedRole);
    setAllowedTabs(
      u.allowedTabs && u.allowedTabs.length > 0
        ? [...u.allowedTabs]
        : [...DEFAULT_GERENTE_VIEW]
    );
    setEditableTabs(u.editableTabs ? [...u.editableTabs] : []);
    setActive(u.active);
    setFormError(null);
    setProviderHelp(false);
    setCreateOpen(true);
  }

  const toggleAllowedTab = (tab: GerenteViewableTab) => {
    setAllowedTabs((prev) => {
      if (prev.includes(tab)) {
        const next = prev.filter((t) => t !== tab);
        setEditableTabs((ed) => ed.filter((e) => e !== tab));
        return next;
      }
      return [...prev, tab];
    });
  };

  const toggleEditableTab = (tab: GerenteEditableTab) => {
    if (!allowedTabs.includes(tab)) return;
    setEditableTabs((prev) =>
      prev.includes(tab) ? prev.filter((t) => t !== tab) : [...prev, tab]
    );
  };

  const describePermissions = (
    r: UserRole,
    viewTabs: GerenteViewableTab[],
    editTabs: GerenteEditableTab[]
  ): string => {
    if (r === 'socio') return 'Sócio · Acesso Total (entra em Aporte por Sócios)';
    if (r === 'diretor') return 'Diretor · Acesso Total Administrativo';
    const viewLabels = viewTabs.map((t) => TAB_LABEL_MAP[t]).join(', ') || 'Nenhuma aba';
    const editLabels = editTabs.map((t) => TAB_LABEL_MAP[t]).join(', ') || 'Somente leitura';
    return `Gerente · Vê: ${viewLabels} · Altera: ${editLabels}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setProviderHelp(false);

    const cleanName = displayName.trim();
    const cleanEmail = email.trim().toLowerCase();

    if (
      cleanName.length < VALIDATION_LIMITS.DISPLAY_NAME_MIN ||
      cleanName.length > VALIDATION_LIMITS.DISPLAY_NAME_MAX
    ) {
      setFormError('Informe um nome válido entre 2 e 80 caracteres.');
      return;
    }

    if (role === 'gerente' && allowedTabs.length === 0) {
      setFormError('Selecione pelo menos uma aba visível para o Gerente.');
      return;
    }

    const finalAllowed =
      role === 'gerente' ? allowedTabs : [...GERENTE_VIEWABLE_TABS];
    const finalEditable =
      role === 'gerente'
        ? editableTabs.filter((t) => allowedTabs.includes(t))
        : [...GERENTE_EDITABLE_TABS];

    if (editingUser) {
      requestConfirmation({
        title: 'Confirmar Alteração de Permissão',
        description: `Deseja atualizar o nível de acesso e as permissões de ${editingUser.displayName}?`,
        details: [
          { label: 'Usuário', value: cleanName },
          { label: 'Nível', value: USER_ROLE_LABELS[role] },
          {
            label: 'Escopo',
            value: describePermissions(role, finalAllowed, finalEditable),
          },
          { label: 'Situação', value: active ? 'Ativo' : 'Suspenso' },
        ],
        confirmLabel: 'Confirmar Alteração',
        tone: 'primary',
        onConfirm: async () => {
          await onUpdateUserProfile(editingUser, {
            displayName: cleanName,
            role,
            allowedTabs: finalAllowed,
            editableTabs: finalEditable,
            active,
          });
          setCreateOpen(false);
        },
      });
      return;
    }

    if (!cleanEmail.includes('@') || cleanEmail.length < 5) {
      setFormError('Informe um e-mail válido para o usuário.');
      return;
    }
    if (password.length < 6) {
      setFormError('A senha inicial deve ter pelo menos 6 caracteres (regra do Firebase Auth).');
      return;
    }

    requestConfirmation({
      title: 'Confirmar Criação de Novo Acesso',
      description:
        'A conta será criada no Firebase Authentication com o e-mail e senha definidos por você, sem encerrar sua sessão atual.',
      details: [
        { label: 'Nome', value: cleanName },
        { label: 'E-mail', value: cleanEmail },
        { label: 'Nível', value: USER_ROLE_LABELS[role] },
        {
          label: 'Permissões',
          value: describePermissions(role, finalAllowed, finalEditable),
        },
      ],
      confirmLabel: 'Criar Acesso Agora',
      tone: 'primary',
      onConfirm: async () => {
        try {
          await provisionAuthUserViaSecondaryApp(
            cleanEmail,
            password,
            cleanName,
            (uid) =>
              onRegisterUserProfile({
                uid,
                email: cleanEmail,
                displayName: cleanName,
                role,
                allowedTabs: finalAllowed,
                editableTabs: finalEditable,
              })
          );
          setCreateOpen(false);
        } catch (err: unknown) {
          const code = (err as { code?: string })?.code || '';
          if (code === 'auth/operation-not-allowed') {
            setProviderHelp(true);
            setFormError(
              'O provedor E-mail/Senha ainda não foi ativado no Firebase Console.'
            );
          } else if (code === 'auth/email-already-in-use') {
            setFormError('Este e-mail já está cadastrado no Firebase Authentication.');
          } else if (code === 'auth/weak-password') {
            setFormError('Senha muito fraca. Utilize pelo menos 6 caracteres.');
          } else {
            setFormError(
              getFirestoreErrorMessage(err) || 'Erro ao criar usuário no Firebase Auth.'
            );
          }
          throw err;
        }
      },
    });
  };

  const handleDelete = (target: UserProfile) => {
    if (target.uid === currentUserUid) return;
    const targetRole = normalizeUserRole(target.role);
    requestConfirmation({
      title: 'Confirmar Remoção de Acesso',
      description: `O usuário ${target.displayName} (${target.email}) perderá imediatamente acesso ao sistema Creps Urca.`,
      details: [
        { label: 'E-mail', value: target.email },
        { label: 'Perfil', value: USER_ROLE_LABELS[targetRole] },
      ],
      confirmLabel: 'Revogar Acesso',
      tone: 'danger',
      onConfirm: async () => {
        await onDeleteUserProfile(target);
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Equipe &amp; Controle de Permissões
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Cadastre Sócios, Diretores e Gerentes definindo exatamente quais abas cada gerente pode visualizar e alterar.
          </p>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Criar Novo Acesso
        </button>
      </div>

      {/* Role Legend */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1.5">
          <p className="text-xs font-semibold text-teal-700 dark:text-teal-400">
            Sócio (Acesso Total)
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Acesso irrestrito a todas as abas, auditoria e equipe. Aparece automaticamente nos seletores de Aporte por Sócios e Pagamentos.
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1.5">
          <p className="text-xs font-semibold text-sky-700 dark:text-sky-400">
            Diretor (Acesso Total)
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Acesso total administrativo para operar, editar, auditar e cadastrar usuários, sem entrar na divisão societária de aportes.
          </p>
        </div>
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-1.5">
          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
            Gerente (Escopo Configurável)
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            Visualiza e altera somente as abas marcadas no cadastro por um Sócio ou Diretor (ex.: apenas Inventário e Checklist).
          </p>
        </div>
      </div>

      {loading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 animate-pulse">
          <div className="h-4 w-1/2 bg-slate-200 dark:bg-slate-800 rounded" />
        </div>
      ) : users.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-2">
          <UserCheck className="w-6 h-6 text-slate-400 mx-auto" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Nenhum usuário adicional cadastrado ainda
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Clique em &ldquo;Criar Novo Acesso&rdquo; para cadastrar os Sócios e Gerentes.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Nome</th>
                  <th className="py-3 px-4">E-mail</th>
                  <th className="py-3 px-4">Nível</th>
                  <th className="py-3 px-4">Permissões de Abas</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                {users.map((u) => {
                  const isSelf = u.uid === currentUserUid;
                  const normalizedRole = normalizeUserRole(u.role);
                  const viewTabs = u.allowedTabs || [];
                  const editTabs = u.editableTabs || [];
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="py-3.5 px-4 font-medium text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {u.displayName}
                        {isSelf && (
                          <span className="ml-2 text-xs font-normal text-slate-400">(Você)</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {u.email}
                      </td>
                      <td className="py-3.5 px-4 text-xs whitespace-nowrap">
                        <span
                          className={
                            normalizedRole === 'socio'
                              ? 'font-semibold text-teal-700 dark:text-teal-400'
                              : normalizedRole === 'diretor'
                              ? 'font-semibold text-sky-700 dark:text-sky-400'
                              : 'font-medium text-slate-700 dark:text-slate-300'
                          }
                        >
                          {USER_ROLE_LABELS[normalizedRole]}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-400">
                        {normalizedRole !== 'gerente' ? (
                          <span>Acesso total (todas as abas e auditoria)</span>
                        ) : (
                          <div className="space-y-0.5">
                            <div>
                              <span className="text-slate-400">Vê:</span>{' '}
                              {viewTabs.map((t) => TAB_LABEL_MAP[t] || t).join(', ') || 'Nenhuma'}
                            </div>
                            <div>
                              <span className="text-slate-400">Edita:</span>{' '}
                              {editTabs.map((t) => TAB_LABEL_MAP[t] || t).join(', ') || 'Somente leitura'}
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs whitespace-nowrap">
                        <span
                          className={
                            u.active
                              ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                              : 'text-red-600 dark:text-red-400 font-medium'
                          }
                        >
                          {u.active ? 'Ativo' : 'Suspenso'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(u)}
                            aria-label={`Editar ${u.displayName}`}
                            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          {!isSelf && (
                            <button
                              type="button"
                              onClick={() => handleDelete(u)}
                              aria-label={`Remover ${u.displayName}`}
                              className="p-2 rounded-lg text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit User Modal */}
      {createOpen && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                {editingUser ? 'Editar Usuário e Permissões' : 'Criar Acesso com E-mail e Senha'}
              </h3>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{formError}</span>
                  </div>
                  {providerHelp && (
                    <p className="pl-6 leading-relaxed">
                      Ative em{' '}
                      <a
                        href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`}
                        target="_blank"
                        rel="noreferrer"
                        className="underline font-semibold"
                      >
                        Firebase Console &rarr; Authentication &rarr; Sign-in method
                      </a>{' '}
                      (provedor E-mail/senha).
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Nome completo *
                </label>
                <input
                  type="text"
                  required
                  maxLength={80}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ex.: Letícia, Sócio Marcos ou Gerente Carlos"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  E-mail *
                </label>
                <input
                  type="email"
                  required
                  disabled={Boolean(editingUser)}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@crepsurca.com.br"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 disabled:opacity-60 focus:border-teal-600 focus:outline-none"
                />
              </div>

              {!editingUser && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Senha inicial definida por você *
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Nível de Permissão
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                >
                  <option value="socio">Sócio (Acesso Total + Aporte Societário)</option>
                  <option value="diretor">Diretor (Acesso Total Administrativo)</option>
                  <option value="gerente">Gerente (Abas e Edições Configuráveis)</option>
                </select>
              </div>

              {role === 'gerente' && (
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-4">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      1. Abas que este Gerente pode visualizar:
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {GERENTE_VIEWABLE_TABS.map((tab) => (
                        <label
                          key={tab}
                          className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={allowedTabs.includes(tab)}
                            onChange={() => toggleAllowedTab(tab)}
                            className="w-4 h-4 rounded border-slate-300 text-teal-700"
                          />
                          <span>{TAB_LABEL_MAP[tab]}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
                    <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      2. Abas que este Gerente pode alterar (criar/editar/excluir):
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {GERENTE_EDITABLE_TABS.map((tab) => {
                        const canEnable = allowedTabs.includes(tab);
                        return (
                          <label
                            key={tab}
                            className={`flex items-center gap-2 text-xs ${
                              canEnable
                                ? 'text-slate-700 dark:text-slate-300 cursor-pointer'
                                : 'text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            <input
                              type="checkbox"
                              disabled={!canEnable}
                              checked={canEnable && editableTabs.includes(tab)}
                              onChange={() => toggleEditableTab(tab)}
                              className="w-4 h-4 rounded border-slate-300 text-teal-700"
                            />
                            <span>{TAB_LABEL_MAP[tab]}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {editingUser && (
                <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={(e) => setActive(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-teal-700"
                  />
                  <span>Conta ativa (desmarque para suspender o acesso imediatamente)</span>
                </label>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white text-sm font-semibold transition-colors"
                >
                  {editingUser ? 'Revisar Alteração' : 'Revisar Criação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
