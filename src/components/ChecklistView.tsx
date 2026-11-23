import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  Clock,
  Edit3,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  formatDateBR,
  getTodayIsoDate,
  TASK_CATEGORIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  validateTaskPayload,
  type TaskCategory,
  type TaskPriority,
  type TaskStatus,
  type TransitionTask,
} from '../types/domain';
import { getDeadlineBadgeLabel, isUrgentTask } from '../lib/notifications';
import type { ConfirmDialogState } from './ConfirmActionModal';

interface ChecklistViewProps {
  tasks: TransitionTask[];
  loading: boolean;
  canEdit: boolean;
  onCreateTask: (input: {
    title: string;
    description: string;
    category: TaskCategory;
    assigneeName: string;
    dueDate: string;
    status: TaskStatus;
    priority: TaskPriority;
  }) => Promise<void>;
  onUpdateTask: (
    existing: TransitionTask,
    updates: {
      title: string;
      description: string;
      category: TaskCategory;
      assigneeName: string;
      dueDate: string;
      status: TaskStatus;
      priority: TaskPriority;
    }
  ) => Promise<void>;
  onDeleteTask: (task: TransitionTask) => Promise<void>;
  onImportStarter: () => Promise<void>;
  requestConfirmation: (dialog: Omit<ConfirmDialogState, 'open'>) => void;
  externalOpenCreate?: boolean;
  onConsumeExternalOpenCreate?: () => void;
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  urgente: 'Urgente',
};

export const ChecklistView: React.FC<ChecklistViewProps> = ({
  tasks,
  loading,
  canEdit,
  onCreateTask,
  onUpdateTask,
  onDeleteTask,
  onImportStarter,
  requestConfirmation,
  externalOpenCreate,
  onConsumeExternalOpenCreate,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus | 'urgent'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | TaskCategory>('all');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TransitionTask | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<TaskCategory>('Operacional');
  const [assigneeName, setAssigneeName] = useState('Tiago');
  const [dueDate, setDueDate] = useState(getTodayIsoDate());
  const [status, setStatus] = useState<TaskStatus>('pendente');
  const [priority, setPriority] = useState<TaskPriority>('media');
  const [formError, setFormError] = useState<string | null>(null);

  React.useEffect(() => {
    if (externalOpenCreate && canEdit) {
      openCreateModal();
      onConsumeExternalOpenCreate?.();
    }
  }, [externalOpenCreate, canEdit]);

  const assignees = useMemo(() => {
    const set = new Set<string>(['Tiago', 'Letícia', 'Gerente de Loja']);
    tasks.forEach((t) => set.add(t.assigneeName));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks
      .filter((t) => {
        if (statusFilter === 'urgent') return isUrgentTask(t);
        if (statusFilter !== 'all' && t.status !== statusFilter) return false;
        if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
        if (assigneeFilter !== 'all' && t.assigneeName !== assigneeFilter) return false;
        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase();
          return (
            t.title.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q) ||
            t.assigneeName.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (a.status === 'concluido' && b.status !== 'concluido') return 1;
        if (a.status !== 'concluido' && b.status === 'concluido') return -1;
        return a.dueDate.localeCompare(b.dueDate);
      });
  }, [tasks, statusFilter, categoryFilter, assigneeFilter, searchTerm]);

  function openCreateModal() {
    setEditingTask(null);
    setTitle('');
    setDescription('');
    setCategory('Operacional');
    setAssigneeName('Tiago');
    setDueDate(getTodayIsoDate());
    setStatus('pendente');
    setPriority('alta');
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(task: TransitionTask) {
    setEditingTask(task);
    setTitle(task.title);
    setDescription(task.description);
    setCategory(task.category);
    setAssigneeName(task.assigneeName);
    setDueDate(task.dueDate);
    setStatus(task.status);
    setPriority(task.priority);
    setFormError(null);
    setModalOpen(true);
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      title,
      description,
      category,
      assigneeName,
      dueDate,
      status,
      priority,
    };
    const err = validateTaskPayload(payload);
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);

    if (editingTask) {
      requestConfirmation({
        title: 'Confirmar Alteração de Atividade',
        description:
          'Revise os dados abaixo. A alteração será gravada no banco de dados e registrada nos logs de auditoria.',
        details: [
          { label: 'Atividade', value: title.trim() },
          { label: 'Responsável', value: assigneeName.trim() },
          { label: 'Data Limite', value: formatDateBR(dueDate) },
          { label: 'Status', value: STATUS_LABELS[status] },
        ],
        confirmLabel: 'Confirmar Alteração',
        tone: 'primary',
        onConfirm: async () => {
          await onUpdateTask(editingTask, payload);
          setModalOpen(false);
        },
      });
    } else {
      requestConfirmation({
        title: 'Confirmar Inclusão de Atividade',
        description:
          'Confirme a criação desta atividade no checklist oficial de transição da Creps Urca.',
        details: [
          { label: 'Atividade', value: title.trim() },
          { label: 'Categoria', value: category },
          { label: 'Responsável', value: assigneeName.trim() },
          { label: 'Data Limite', value: formatDateBR(dueDate) },
        ],
        confirmLabel: 'Confirmar Inclusão',
        tone: 'primary',
        onConfirm: async () => {
          await onCreateTask(payload);
          setModalOpen(false);
        },
      });
    }
  };

  const handleToggleDone = (task: TransitionTask) => {
    if (!canEdit) return;
    const nextStatus: TaskStatus = task.status === 'concluido' ? 'pendente' : 'concluido';
    requestConfirmation({
      title:
        nextStatus === 'concluido'
          ? 'Confirmar Conclusão da Atividade'
          : 'Confirmar Reabertura da Atividade',
      description: `Deseja alterar o status de "${task.title}" para ${STATUS_LABELS[nextStatus]}?`,
      details: [
        { label: 'Responsável', value: task.assigneeName },
        { label: 'Novo Status', value: STATUS_LABELS[nextStatus] },
      ],
      confirmLabel: nextStatus === 'concluido' ? 'Marcar Concluída' : 'Reabrir Tarefa',
      tone: 'primary',
      onConfirm: async () => {
        await onUpdateTask(task, {
          title: task.title,
          description: task.description,
          category: task.category,
          assigneeName: task.assigneeName,
          dueDate: task.dueDate,
          status: nextStatus,
          priority: task.priority,
        });
      },
    });
  };

  const handleDelete = (task: TransitionTask) => {
    if (!canEdit) return;
    requestConfirmation({
      title: 'Confirmar Exclusão de Atividade',
      description:
        'Esta atividade será removida permanentemente do checklist. O histórico da exclusão permanecerá salvo na auditoria.',
      details: [
        { label: 'Atividade', value: task.title },
        { label: 'Responsável', value: task.assigneeName },
        { label: 'Prazo', value: formatDateBR(task.dueDate) },
      ],
      confirmLabel: 'Excluir Permanentemente',
      tone: 'danger',
      onConfirm: async () => {
        await onDeleteTask(task);
      },
    });
  };

  const handleImportStarterClick = () => {
    requestConfirmation({
      title: 'Confirmar Importação do Checklist Base da Urca',
      description:
        'Serão incluídas 5 atividades iniciais de transição (exame admissional, máquinas Cielo, sistema Gcom, conta bancária dos sócios e inventário físico).',
      details: [
        { label: 'Quantidade', value: '5 atividades essenciais' },
        { label: 'Auditoria', value: 'Registrada automaticamente' },
      ],
      confirmLabel: 'Importar Atividades',
      tone: 'primary',
      onConfirm: async () => {
        await onImportStarter();
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Read-only notice */}
      {!canEdit && (
        <div className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900 text-xs text-slate-600 dark:text-slate-300 flex items-center justify-between gap-4">
          <span>
            <strong>Modo Somente Leitura (Gerente):</strong> consulte os responsáveis e prazos de execução das tarefas. Inclusões e alterações exigem permissão de edição liberada por um Sócio ou Diretor.
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
          {(
            [
              { id: 'all', label: `Todas (${tasks.length})` },
              {
                id: 'pendente',
                label: `Pendentes (${tasks.filter((t) => t.status === 'pendente').length})`,
              },
              {
                id: 'em_andamento',
                label: `Em andamento (${tasks.filter((t) => t.status === 'em_andamento').length})`,
              },
              {
                id: 'concluido',
                label: `Concluídas (${tasks.filter((t) => t.status === 'concluido').length})`,
              },
              {
                id: 'urgent',
                label: `Urgentes (${tasks.filter((t) => isUrgentTask(t)).length})`,
              },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                statusFilter === tab.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {canEdit && (
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleImportStarterClick}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 transition-colors whitespace-nowrap shrink-0"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
              Carregar Modelo Urca
            </button>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              Nova Atividade
            </button>
          </div>
        )}
      </div>

      {/* Filters Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar atividade ou descrição..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as 'all' | TaskCategory)}
          aria-label="Filtrar por categoria"
          className="px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
        >
          <option value="all">Todas as categorias</option>
          {TASK_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        <select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          aria-label="Filtrar por responsável"
          className="px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
        >
          <option value="all">Todos os responsáveis</option>
          {assignees.map((person) => (
            <option key={person} value={person}>
              {person}
            </option>
          ))}
        </select>
      </div>

      {/* Content */}
      {loading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-200 dark:divide-slate-800">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="p-4 flex items-center justify-between gap-4 animate-pulse">
              <div className="h-4 w-1/2 bg-slate-200 dark:bg-slate-800 rounded" />
              <div className="h-4 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
            </div>
          ))}
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-3">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Nenhuma atividade encontrada para os filtros selecionados
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {tasks.length === 0
              ? 'Adicione suas atividades de transição (exame admissional, Cielo, Gcom, conta bancária, inventário) ou importe o modelo inicial.'
              : 'Ajuste a busca ou limpe os filtros acima para visualizar todo o checklist.'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Atividade</th>
                  <th className="py-3 px-4">Responsável</th>
                  <th className="py-3 px-4">Prazo Limite</th>
                  <th className="py-3 px-4">Prioridade</th>
                  <th className="py-3 px-4">Status</th>
                  {canEdit && <th className="py-3 px-4 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                {filteredTasks.map((task) => {
                  const deadline = getDeadlineBadgeLabel(task);
                  return (
                    <tr
                      key={task.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3.5 px-4 max-w-md">
                        <div className="flex items-start gap-3">
                          <button
                            type="button"
                            disabled={!canEdit}
                            onClick={() => handleToggleDone(task)}
                            aria-label={
                              task.status === 'concluido'
                                ? 'Reabrir atividade'
                                : 'Concluir atividade'
                            }
                            className={`mt-0.5 w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                              task.status === 'concluido'
                                ? 'bg-teal-700 border-teal-700 text-white'
                                : 'border-slate-300 dark:border-slate-600 hover:border-teal-600'
                            } ${!canEdit ? 'cursor-default opacity-75' : 'cursor-pointer'}`}
                          >
                            {task.status === 'concluido' && <Check className="w-3.5 h-3.5" />}
                          </button>
                          <div className="min-w-0">
                            <p
                              className={`font-medium ${
                                task.status === 'concluido'
                                  ? 'line-through text-slate-400 dark:text-slate-500'
                                  : 'text-slate-900 dark:text-slate-100'
                              }`}
                            >
                              {task.title}
                            </p>
                            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                              <span>{task.category}</span>
                              {task.hasPendingWrites && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="text-amber-600 dark:text-amber-400">
                                    Sincronizando offline
                                  </span>
                                </>
                              )}
                            </div>
                            {task.description && (
                              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                                {task.description}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-slate-700 dark:text-slate-300">
                        {task.assigneeName}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="font-mono tabular-nums text-xs text-slate-800 dark:text-slate-200">
                          {formatDateBR(task.dueDate)}
                        </div>
                        <div
                          className={`text-xs mt-0.5 inline-flex items-center gap-1 ${
                            deadline.tone === 'overdue'
                              ? 'text-red-600 dark:text-red-400 font-medium'
                              : deadline.tone === 'urgent'
                              ? 'text-amber-700 dark:text-amber-400 font-medium'
                              : deadline.tone === 'done'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {deadline.tone === 'overdue' || deadline.tone === 'urgent' ? (
                            <AlertTriangle className="w-3 h-3" />
                          ) : (
                            <Clock className="w-3 h-3" />
                          )}
                          <span>{deadline.label}</span>
                        </div>
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs font-medium text-slate-700 dark:text-slate-300">
                        {PRIORITY_LABELS[task.priority]}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap text-xs">
                        <span
                          className={
                            task.status === 'concluido'
                              ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                              : task.status === 'em_andamento'
                              ? 'text-sky-700 dark:text-sky-400 font-medium'
                              : 'text-slate-600 dark:text-slate-400'
                          }
                        >
                          {STATUS_LABELS[task.status]}
                        </span>
                      </td>
                      {canEdit && (
                        <td className="py-3.5 px-4 whitespace-nowrap text-right">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditModal(task)}
                              aria-label={`Editar ${task.title}`}
                              className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(task)}
                              aria-label={`Excluir ${task.title}`}
                              className="p-2 rounded-lg text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create / Edit Task Modal */}
      {modalOpen && canEdit && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                {editingTask ? 'Editar Atividade de Transição' : 'Nova Atividade de Transição'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-6 space-y-4 overflow-y-auto">
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                  {formError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Título da atividade *
                </label>
                <input
                  type="text"
                  required
                  maxLength={140}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Ex.: Marcar exame admissional dos funcionários"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Responsável *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    list="assignee-suggestions"
                    value={assigneeName}
                    onChange={(e) => setAssigneeName(e.target.value)}
                    placeholder="Ex.: Letícia, Tiago, Gerente"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                  />
                  <datalist id="assignee-suggestions">
                    <option value="Tiago" />
                    <option value="Letícia" />
                    <option value="Gerente de Loja" />
                    <option value="Contador" />
                  </datalist>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Data limite *
                  </label>
                  <input
                    type="date"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Categoria
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as TaskCategory)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                  >
                    {TASK_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Prioridade
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as TaskPriority)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                  >
                    {TASK_PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {PRIORITY_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as TaskStatus)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                  >
                    {TASK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Detalhes e instruções
                </label>
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Observações, contatos, documentos ou etapas necessárias..."
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white text-sm font-semibold transition-colors"
                >
                  {editingTask ? 'Revisar Alteração' : 'Revisar Inclusão'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
