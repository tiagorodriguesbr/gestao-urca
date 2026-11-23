import React, { useMemo, useState } from 'react';
import { History, Search, ShieldCheck } from 'lucide-react';
import { formatCurrencyBRL, type AuditLog } from '../types/domain';

interface AuditLogsViewProps {
  logs: AuditLog[];
  loading: boolean;
}

const ENTITY_LABELS: Record<AuditLog['entityType'], string> = {
  task: 'Checklist',
  payment: 'Pagamento',
  inventory: 'Inventário',
  user: 'Usuário',
  partner: 'Sócio',
  system: 'Sistema',
};

const ACTION_LABELS: Record<AuditLog['action'], string> = {
  create: 'Inclusão',
  update: 'Alteração',
  delete: 'Exclusão',
};

function formatAuditTimestamp(ts: unknown): string {
  if (!ts) return 'Sincronizando...';
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
    const d = (ts as { toDate: () => Date }).toDate();
    return d.toLocaleString('pt-BR');
  }
  return 'Registrado';
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({ logs, loading }) => {
  const [entityFilter, setEntityFilter] = useState<'all' | AuditLog['entityType']>('all');
  const [actionFilter, setActionFilter] = useState<'all' | AuditLog['action']>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const filtered = useMemo(() => {
    return logs.filter((log) => {
      if (entityFilter !== 'all' && log.entityType !== entityFilter) return false;
      if (actionFilter !== 'all' && log.action !== actionFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return (
          log.summary.toLowerCase().includes(q) ||
          log.actorName.toLowerCase().includes(q) ||
          log.actorEmail.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [logs, entityFilter, actionFilter, searchTerm]);

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-teal-700 dark:text-teal-400" />
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Auditoria Imutável do Banco de Dados
            </h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Todas as inclusões, edições e exclusões são gravadas atomicamente na coleção dedicada{' '}
            <code className="font-mono text-[11px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
              audit_logs
            </code>{' '}
            com bloqueio de edição/exclusão nas regras do Firestore e suporte a Cloud Functions v2.
          </p>
        </div>
        <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
          {logs.length} eventos registrados
        </div>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filtrar por autor ou descrição..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
          />
        </div>

        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value as 'all' | AuditLog['entityType'])}
          aria-label="Filtrar entidade"
          className="px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
        >
          <option value="all">Todas as coleções</option>
          <option value="task">Checklist</option>
          <option value="payment">Pagamentos</option>
          <option value="inventory">Inventário</option>
          <option value="user">Usuários</option>
          <option value="partner">Sócios</option>
          <option value="system">Sistema</option>
        </select>

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value as 'all' | AuditLog['action'])}
          aria-label="Filtrar ação"
          className="px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
        >
          <option value="all">Todas as operações</option>
          <option value="create">Inclusão</option>
          <option value="update">Alteração</option>
          <option value="delete">Exclusão</option>
        </select>
      </div>

      {loading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3 animate-pulse">
          <div className="h-4 w-full bg-slate-200 dark:bg-slate-800 rounded" />
          <div className="h-4 w-2/3 bg-slate-200 dark:bg-slate-800 rounded" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-2">
          <History className="w-6 h-6 text-slate-400 mx-auto" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Nenhum evento de auditoria encontrado
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Qualquer alteração feita por um Sócio, Diretor ou Gerente autorizado aparecerá aqui em tempo real.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Data / Hora</th>
                  <th className="py-3 px-4">Operação</th>
                  <th className="py-3 px-4">Resumo da Alteração</th>
                  <th className="py-3 px-4">Autor</th>
                  <th className="py-3 px-4 text-right">Valor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                {filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 whitespace-nowrap font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400">
                      {formatAuditTimestamp(log.timestamp)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-xs">
                      <span
                        className={`font-semibold ${
                          log.action === 'delete'
                            ? 'text-red-600 dark:text-red-400'
                            : log.action === 'update'
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {ACTION_LABELS[log.action]}
                      </span>
                      <span className="text-slate-400 mx-1.5">·</span>
                      <span className="text-slate-600 dark:text-slate-300">
                        {ENTITY_LABELS[log.entityType]}
                      </span>
                    </td>
                    <td className="py-3 px-4 max-w-md">
                      <p className="text-slate-900 dark:text-slate-100 text-xs font-medium">
                        {log.summary}
                      </p>
                      {log.changedFields.length > 0 && (
                        <p className="font-mono text-[11px] text-slate-400 mt-0.5 truncate">
                          Campos: {log.changedFields.join(', ')}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-xs">
                      <p className="font-medium text-slate-800 dark:text-slate-200">
                        {log.actorName}
                      </p>
                      <p className="text-slate-500 dark:text-slate-400">{log.actorEmail}</p>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-right font-mono tabular-nums text-xs text-slate-800 dark:text-slate-200">
                      {log.amount > 0 ? formatCurrencyBRL(log.amount) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
