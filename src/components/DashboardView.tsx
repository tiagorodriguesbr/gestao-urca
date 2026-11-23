import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Wallet,
} from 'lucide-react';
import {
  formatCurrencyBRL,
  formatDateBR,
  type TransitionPayment,
  type TransitionTask,
} from '../types/domain';
import { getDeadlineBadgeLabel, isUrgentTask } from '../lib/notifications';

interface DashboardViewProps {
  tasks: TransitionTask[];
  payments: TransitionPayment[];
  isMaster: boolean;
  onNavigate: (tab: 'checklist' | 'payments' | 'reports') => void;
  onOpenNewTask: () => void;
  onOpenNewPayment: () => void;
}

const CHART_COLORS = ['#0f766e', '#0284c7', '#d97706', '#475569', '#059669', '#64748b'];

export const DashboardView: React.FC<DashboardViewProps> = ({
  tasks,
  payments,
  isMaster,
  onNavigate,
  onOpenNewTask,
  onOpenNewPayment,
}) => {
  const stats = useMemo(() => {
    const totalSpent = payments.reduce((sum, p) => sum + p.amount, 0);
    const paidSpent = payments
      .filter((p) => p.status === 'pago')
      .reduce((sum, p) => sum + p.amount, 0);
    const tiagoSpent = payments
      .filter((p) => p.paidBy === 'Tiago')
      .reduce((sum, p) => sum + p.amount, 0);
    const leticiaSpent = payments
      .filter((p) => p.paidBy === 'Letícia')
      .reduce((sum, p) => sum + p.amount, 0);
    const companySpent = payments
      .filter((p) => p.paidBy === 'Empresa Creps Urca')
      .reduce((sum, p) => sum + p.amount, 0);

    const completedCount = tasks.filter((t) => t.status === 'concluido').length;
    const inProgressCount = tasks.filter((t) => t.status === 'em_andamento').length;
    const progressPct = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

    const urgentList = tasks
      .filter((t) => isUrgentTask(t))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    return {
      totalSpent,
      paidSpent,
      tiagoSpent,
      leticiaSpent,
      companySpent,
      completedCount,
      inProgressCount,
      progressPct,
      urgentList,
    };
  }, [tasks, payments]);

  const paymentsByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of payments) {
      map.set(p.category, (map.get(p.category) || 0) + p.amount);
    }
    return Array.from(map.entries())
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);
  }, [payments]);

  const partnerSplitData = useMemo(() => {
    return [
      { name: 'Tiago', valor: stats.tiagoSpent },
      { name: 'Letícia', valor: stats.leticiaSpent },
      { name: 'Empresa', valor: stats.companySpent },
    ].filter((d) => d.valor > 0);
  }, [stats.tiagoSpent, stats.leticiaSpent, stats.companySpent]);

  return (
    <div className="space-y-8">
      {/* KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Total Gasto Pré-Operacional</span>
            <Wallet className="w-4 h-4 text-teal-700 dark:text-teal-400" />
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 dark:text-slate-50">
            {formatCurrencyBRL(stats.totalSpent)}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <span>{payments.length} lançamentos</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">{formatCurrencyBRL(stats.paidSpent)} quitados</span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Aporte por Sócio (Tiago / Letícia)</span>
            <span className="font-mono text-[11px] text-slate-400">50/50</span>
          </div>
          <div className="space-y-1">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-300">Tiago</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                {formatCurrencyBRL(stats.tiagoSpent)}
              </span>
            </div>
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-300">Letícia</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                {formatCurrencyBRL(stats.leticiaSpent)}
              </span>
            </div>
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
            Diferença:{' '}
            {formatCurrencyBRL(Math.abs(stats.tiagoSpent - stats.leticiaSpent))}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Progresso da Transição</span>
            <ClipboardList className="w-4 h-4 text-teal-700 dark:text-teal-400" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-mono tabular-nums text-2xl font-bold text-slate-900 dark:text-slate-50">
              {stats.progressPct}%
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              ({stats.completedCount}/{tasks.length} concluídas)
            </span>
          </div>
          <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-700 dark:bg-teal-500 transition-all duration-300"
              style={{ width: `${stats.progressPct}%` }}
            />
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Prazos Urgentes (48h / Atraso)</span>
            <CalendarClock
              className={`w-4 h-4 ${
                stats.urgentList.length > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            />
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 dark:text-slate-50">
            {stats.urgentList.length}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {stats.urgentList.length > 0
              ? 'Atividades exigem atenção imediata'
              : 'Nenhum prazo crítico em aberto'}
          </div>
        </div>
      </section>

      {/* Main Analytics Split */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Custos por Categoria de Implantação
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Distribuição dos gastos realizados até a abertura da loja
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('payments')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap shrink-0"
            >
              Ver pagamentos
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {paymentsByCategory.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg p-6">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Nenhum pagamento registrado ainda
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-xs">
                Lance as despesas pré-operacionais de Tiago e Letícia para visualizar a composição de custos.
              </p>
              {isMaster && (
                <button
                  type="button"
                  onClick={onOpenNewPayment}
                  className="mt-4 px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-medium transition-colors"
                >
                  Lançar Primeiro Pagamento
                </button>
              )}
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={paymentsByCategory}
                  margin={{ top: 8, right: 16, left: 4, bottom: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    interval={0}
                    angle={-12}
                    textAnchor="end"
                    height={54}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickFormatter={(v) => `R$ ${Math.round(Number(v) / 1000)}k`}
                  />
                  <Tooltip
                    formatter={(value) => [formatCurrencyBRL(Number(value ?? 0)), 'Total']}
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="total" radius={[6, 6, 0, 0]} fill="#0f766e" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Divisão Financeira entre Sócios
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Participação proporcional nos pagamentos lançados
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap shrink-0"
            >
              Relatórios
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {partnerSplitData.length === 0 ? (
            <div className="h-64 flex items-center justify-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-500 dark:text-slate-400">
              Aguardando lançamentos financeiros
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 items-center gap-4">
              <div className="h-56 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={partnerSplitData}
                      dataKey="valor"
                      nameKey="name"
                      innerRadius={48}
                      outerRadius={76}
                      paddingAngle={3}
                    >
                      {partnerSplitData.map((entry, idx) => (
                        <Cell key={entry.name} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => formatCurrencyBRL(Number(value ?? 0))}
                      contentStyle={{
                        backgroundColor: '#0f172a',
                        border: '1px solid #334155',
                        borderRadius: '8px',
                        color: '#f8fafc',
                        fontSize: '12px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-3">
                {partnerSplitData.map((item, idx) => {
                  const pct =
                    stats.totalSpent > 0 ? Math.round((item.valor / stats.totalSpent) * 100) : 0;
                  return (
                    <div
                      key={item.name}
                      className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-b-0"
                    >
                      <div className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                        />
                        <span>{item.name}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-mono tabular-nums text-xs font-semibold text-slate-900 dark:text-slate-100">
                          {formatCurrencyBRL(item.valor)}
                        </div>
                        <div className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                          {pct}%
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Urgent Tasks Spotlight */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Agenda Crítica da Transição
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Atividades vencendo em até 48 horas, atrasadas ou marcadas como urgentes
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isMaster && (
              <button
                type="button"
                onClick={onOpenNewTask}
                className="px-3.5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white text-xs font-medium transition-colors whitespace-nowrap shrink-0"
              >
                Nova Atividade
              </button>
            )}
            <button
              type="button"
              onClick={() => onNavigate('checklist')}
              className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              Abrir Checklist Completo
            </button>
          </div>
        </div>

        {stats.urgentList.length === 0 ? (
          <div className="p-8 text-center flex flex-col items-center gap-2">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
              {tasks.length === 0
                ? 'Checklist de transição ainda vazio'
                : 'Todos os prazos críticos estão sob controle'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {tasks.length === 0
                ? 'Acesse a aba Checklist para incluir atividades ou importar o modelo inicial da Urca.'
                : 'Nenhuma atividade pendente com vencimento imediato.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {stats.urgentList.slice(0, 6).map((task) => {
              const badge = getDeadlineBadgeLabel(task);
              return (
                <div
                  key={task.id}
                  className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <AlertTriangle
                        className={`w-4 h-4 shrink-0 ${
                          badge.tone === 'overdue'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      />
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {task.title}
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2 pl-6">
                      <span>{task.category}</span>
                      <span aria-hidden="true">·</span>
                      <span>Responsável: {task.assigneeName}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 pl-6 sm:pl-0 shrink-0">
                    <span
                      className={`text-xs font-medium ${
                        badge.tone === 'overdue'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {badge.label}
                    </span>
                    <span className="font-mono tabular-nums text-xs text-slate-600 dark:text-slate-300">
                      {formatDateBR(task.dueDate)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
