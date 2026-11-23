import React, { useEffect, useMemo, useState } from 'react';
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
  ArrowRight,
  CalendarClock,
  Check,
  ClipboardList,
  Users,
  Wallet,
} from 'lucide-react';
import {
  formatCurrencyBRL,
  type PartnerRecord,
  type TransitionPayment,
  type TransitionTask,
} from '../types/domain';
import { isUrgentTask } from '../lib/notifications';

interface DashboardViewProps {
  tasks: TransitionTask[];
  payments: TransitionPayment[];
  partners: PartnerRecord[];
  isFullAdmin: boolean;
  canEditPayments: boolean;
  onNavigate: (tab: 'checklist' | 'payments' | 'reports' | 'team') => void;
  onOpenNewPayment: () => void;
}

const CHART_COLORS = ['#0f766e', '#0284c7', '#d97706', '#475569', '#059669', '#64748b'];

export const DashboardView: React.FC<DashboardViewProps> = ({
  tasks,
  payments,
  partners,
  isFullAdmin,
  canEditPayments,
  onNavigate,
  onOpenNewPayment,
}) => {
  const activePartners = useMemo(
    () =>
      partners
        .filter((p) => p.active)
        .sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR')),
    [partners]
  );

  const [selectedPartnerIds, setSelectedPartnerIds] = useState<string[]>([]);

  useEffect(() => {
    setSelectedPartnerIds((prev) => {
      const validIds = activePartners.map((p) => p.uid);
      const preserved = prev.filter((id) => validIds.includes(id));
      if (preserved.length > 0) return preserved;
      return validIds;
    });
  }, [activePartners]);

  const togglePartnerSelection = (uid: string) => {
    setSelectedPartnerIds((prev) => {
      if (prev.includes(uid)) {
        if (prev.length === 1) return prev; // keep at least 1 selected when available
        return prev.filter((id) => id !== uid);
      }
      return [...prev, uid];
    });
  };

  const selectedPartners = useMemo(
    () => activePartners.filter((p) => selectedPartnerIds.includes(p.uid)),
    [activePartners, selectedPartnerIds]
  );

  const stats = useMemo(() => {
    const totalSpent = payments.reduce((sum, p) => sum + p.amount, 0);
    const paidSpent = payments
      .filter((p) => p.status === 'pago')
      .reduce((sum, p) => sum + p.amount, 0);
    const companySpent = payments
      .filter((p) => p.paidBy === 'Empresa Creps Urca')
      .reduce((sum, p) => sum + p.amount, 0);

    const partnerTotals = selectedPartners.map((partner) => ({
      uid: partner.uid,
      name: partner.displayName,
      total: payments
        .filter((p) => p.paidBy === partner.displayName)
        .reduce((sum, p) => sum + p.amount, 0),
    }));

    const selectedSum = partnerTotals.reduce((acc, p) => acc + p.total, 0);
    const maxVal =
      partnerTotals.length > 0 ? Math.max(...partnerTotals.map((p) => p.total)) : 0;
    const minVal =
      partnerTotals.length > 0 ? Math.min(...partnerTotals.map((p) => p.total)) : 0;
    const spreadDiff = partnerTotals.length >= 2 ? maxVal - minVal : 0;

    const completedCount = tasks.filter((t) => t.status === 'concluido').length;
    const progressPct = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;
    const urgentCount = tasks.filter((t) => isUrgentTask(t)).length;

    return {
      totalSpent,
      paidSpent,
      companySpent,
      partnerTotals,
      selectedSum,
      spreadDiff,
      completedCount,
      progressPct,
      urgentCount,
    };
  }, [tasks, payments, selectedPartners]);

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
    const rows = stats.partnerTotals.map((p) => ({
      name: p.name,
      valor: p.total,
    }));
    if (stats.companySpent > 0) {
      rows.push({ name: 'Empresa Creps Urca', valor: stats.companySpent });
    }
    return rows.filter((d) => d.valor > 0);
  }, [stats.partnerTotals, stats.companySpent]);

  const splitTotalBase = useMemo(
    () => partnerSplitData.reduce((acc, row) => acc + row.valor, 0),
    [partnerSplitData]
  );

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
            <span className="font-mono tabular-nums">
              {formatCurrencyBRL(stats.paidSpent)} quitados
            </span>
          </div>
        </div>

        {/* Dynamic Selectable Aporte por Sócios */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Aporte por Sócios</span>
            <Users className="w-4 h-4 text-teal-700 dark:text-teal-400 shrink-0" />
          </div>

          {activePartners.length === 0 ? (
            <div className="space-y-2 py-1">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Nenhum usuário cadastrado com o nível <strong>Sócio</strong> ainda.
              </p>
              {isFullAdmin && (
                <button
                  type="button"
                  onClick={() => onNavigate('team')}
                  className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline"
                >
                  Cadastrar Sócios em Equipe &rarr;
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                {activePartners.map((partner) => {
                  const isSelected = selectedPartnerIds.includes(partner.uid);
                  return (
                    <button
                      key={partner.uid}
                      type="button"
                      onClick={() => togglePartnerSelection(partner.uid)}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors ${
                        isSelected
                          ? 'bg-teal-50 dark:bg-teal-950/60 border-teal-300 dark:border-teal-800 text-teal-800 dark:text-teal-300'
                          : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3" />}
                      <span>{partner.displayName}</span>
                    </button>
                  );
                })}
              </div>

              <div className="space-y-1">
                {stats.partnerTotals.map((p) => (
                  <div key={p.uid} className="flex items-baseline justify-between text-sm gap-2">
                    <span className="text-slate-600 dark:text-slate-300 truncate">{p.name}</span>
                    <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100 shrink-0">
                      {formatCurrencyBRL(p.total)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums flex items-center justify-between gap-2">
                <span>
                  {stats.partnerTotals.length >= 2
                    ? `Diferença: ${formatCurrencyBRL(stats.spreadDiff)}`
                    : `Soma selecionada: ${formatCurrencyBRL(stats.selectedSum)}`}
                </span>
              </div>
            </>
          )}
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
                stats.urgentCount > 0
                  ? 'text-amber-600 dark:text-amber-400'
                  : 'text-emerald-600 dark:text-emerald-400'
              }`}
            />
          </div>
          <div className="font-mono tabular-nums text-2xl font-bold text-slate-900 dark:text-slate-50">
            {stats.urgentCount}
          </div>
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>
              {stats.urgentCount > 0
                ? 'Atividades exigem atenção'
                : 'Nenhum prazo crítico'}
            </span>
            <button
              type="button"
              onClick={() => onNavigate('checklist')}
              className="text-teal-700 dark:text-teal-400 font-medium hover:underline shrink-0"
            >
              Ver checklist
            </button>
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
                Lance as despesas pré-operacionais dos sócios e da empresa para visualizar a composição de custos.
              </p>
              {canEditPayments && (
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
                Participação dos sócios selecionados e conta da empresa
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
            <div className="h-64 flex items-center justify-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-500 dark:text-slate-400 px-4 text-center">
              {activePartners.length === 0
                ? 'Cadastre os Sócios em Equipe e lance pagamentos para visualizar a divisão.'
                : 'Aguardando lançamentos financeiros para os sócios selecionados'}
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
                    splitTotalBase > 0 ? Math.round((item.valor / splitTotalBase) * 100) : 0;
                  return (
                    <div
                      key={item.name}
                      className="flex items-center justify-between gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-b-0"
                    >
                      <div className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-200 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0"
                          style={{ backgroundColor: CHART_COLORS[idx % CHART_COLORS.length] }}
                        />
                        <span className="truncate">{item.name}</span>
                      </div>
                      <div className="text-right shrink-0">
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
    </div>
  );
};
