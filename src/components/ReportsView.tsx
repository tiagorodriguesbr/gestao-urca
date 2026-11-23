import React, { useMemo, useRef, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Download, FileSpreadsheet, FileText } from 'lucide-react';
import {
  formatCurrencyBRL,
  TASK_CATEGORIES,
  type AuditLog,
  type TransitionPayment,
  type TransitionTask,
} from '../types/domain';
import { exportMonthlyPdf, exportToExcel } from '../lib/exportUtils';

interface ReportsViewProps {
  tasks: TransitionTask[];
  payments: TransitionPayment[];
  auditLogs: AuditLog[];
  isMaster: boolean;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  tasks,
  payments,
  auditLogs,
  isMaster,
}) => {
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [exportingPdf, setExportingPdf] = useState(false);
  const chartContainerRef = useRef<HTMLDivElement | null>(null);

  const months = useMemo(() => {
    const set = new Set<string>();
    payments.forEach((p) => {
      if (p.paymentDate.length >= 7) set.add(p.paymentDate.slice(0, 7));
    });
    tasks.forEach((t) => {
      if (t.dueDate.length >= 7) set.add(t.dueDate.slice(0, 7));
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [payments, tasks]);

  const scopedPayments = useMemo(() => {
    if (selectedMonth === 'all') return payments;
    return payments.filter((p) => p.paymentDate.startsWith(selectedMonth));
  }, [payments, selectedMonth]);

  const scopedTasks = useMemo(() => {
    if (selectedMonth === 'all') return tasks;
    return tasks.filter((t) => t.dueDate.startsWith(selectedMonth));
  }, [tasks, selectedMonth]);

  const monthlyChartData = useMemo(() => {
    const map = new Map<
      string,
      { month: string; Tiago: number; Leticia: number; Empresa: number }
    >();
    for (const p of scopedPayments) {
      const ym = p.paymentDate.slice(0, 7);
      const entry = map.get(ym) || { month: ym, Tiago: 0, Leticia: 0, Empresa: 0 };
      if (p.paidBy === 'Tiago') entry.Tiago += p.amount;
      else if (p.paidBy === 'Letícia') entry.Leticia += p.amount;
      else entry.Empresa += p.amount;
      map.set(ym, entry);
    }
    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [scopedPayments]);

  const taskProgressByArea = useMemo(() => {
    return TASK_CATEGORIES.map((cat) => {
      const items = scopedTasks.filter((t) => t.category === cat);
      const done = items.filter((t) => t.status === 'concluido').length;
      const pending = items.length - done;
      return {
        categoria: cat.replace(' & ', '/'),
        Concluidas: done,
        EmAberto: pending,
      };
    }).filter((row) => row.Concluidas + row.EmAberto > 0);
  }, [scopedTasks]);

  const partnerSettlement = useMemo(() => {
    const tiago = scopedPayments
      .filter((p) => p.paidBy === 'Tiago')
      .reduce((s, p) => s + p.amount, 0);
    const leticia = scopedPayments
      .filter((p) => p.paidBy === 'Letícia')
      .reduce((s, p) => s + p.amount, 0);
    const empresa = scopedPayments
      .filter((p) => p.paidBy === 'Empresa Creps Urca')
      .reduce((s, p) => s + p.amount, 0);
    const partnerPool = tiago + leticia;
    const idealEach = partnerPool / 2;
    return {
      total: tiago + leticia + empresa,
      tiago,
      leticia,
      empresa,
      idealEach,
      tiagoBalance: tiago - idealEach,
      leticiaBalance: leticia - idealEach,
    };
  }, [scopedPayments]);

  const monthLabel = selectedMonth === 'all' ? 'Consolidado Geral' : `Mês ${selectedMonth}`;

  const handleExportExcel = () => {
    exportToExcel({
      tasks: scopedTasks,
      payments: scopedPayments,
      auditLogs: isMaster ? auditLogs : undefined,
      monthLabel,
    });
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      await exportMonthlyPdf({
        tasks: scopedTasks,
        payments: scopedPayments,
        monthLabel,
        chartContainer: chartContainerRef.current,
      });
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Report Controls */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Relatórios Financeiros &amp; Progresso da Transição
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Selecione o período mensal e exporte planilhas detalhadas em Excel ou relatórios mensais em PDF com gráficos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            aria-label="Selecionar mês do relatório"
            className="px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
          >
            <option value="all">Todos os meses</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={handleExportExcel}
            className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 transition-colors whitespace-nowrap shrink-0"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-700 dark:text-emerald-400" />
            Exportar Excel (.xlsx)
          </button>

          <button
            type="button"
            disabled={exportingPdf}
            onClick={() => void handleExportPdf()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            {exportingPdf ? <Download className="w-4 h-4 animate-bounce" /> : <FileText className="w-4 h-4" />}
            {exportingPdf ? 'Gerando PDF...' : 'Exportar PDF Mensal'}
          </button>
        </div>
      </div>

      {/* Partner Equalization Box */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
            Acerto de Contas entre Sócios ({monthLabel})
          </h3>
          <span className="font-mono tabular-nums text-xs text-slate-500 dark:text-slate-400">
            Total do período: {formatCurrencyBRL(partnerSettlement.total)}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">Desembolso Tiago</p>
            <p className="font-mono tabular-nums text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">
              {formatCurrencyBRL(partnerSettlement.tiago)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
              Saldo 50/50:{' '}
              {partnerSettlement.tiagoBalance >= 0
                ? `+${formatCurrencyBRL(partnerSettlement.tiagoBalance)} a receber`
                : `${formatCurrencyBRL(partnerSettlement.tiagoBalance)} a compensar`}
            </p>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">Desembolso Letícia</p>
            <p className="font-mono tabular-nums text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">
              {formatCurrencyBRL(partnerSettlement.leticia)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
              Saldo 50/50:{' '}
              {partnerSettlement.leticiaBalance >= 0
                ? `+${formatCurrencyBRL(partnerSettlement.leticiaBalance)} a receber`
                : `${formatCurrencyBRL(partnerSettlement.leticiaBalance)} a compensar`}
            </p>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">Conta Creps Urca</p>
            <p className="font-mono tabular-nums text-lg font-bold text-slate-900 dark:text-slate-100 mt-1">
              {formatCurrencyBRL(partnerSettlement.empresa)}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Pagamentos diretos pela PJ
            </p>
          </div>
        </div>
      </div>

      {/* Interactive Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div
          ref={chartContainerRef}
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4"
        >
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Evolução Mensal por Pagador (Incluído no PDF)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Comparativo mensal entre Tiago, Letícia e conta Creps Urca
            </p>
          </div>

          {monthlyChartData.length === 0 ? (
            <div className="h-64 flex items-center justify-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-500">
              Sem pagamentos neste recorte mensal
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthlyChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickFormatter={(v) => `R$ ${Math.round(Number(v))}`}
                  />
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
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="Tiago" stackId="a" fill="#0f766e" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="Leticia" name="Letícia" stackId="a" fill="#0284c7" />
                  <Bar dataKey="Empresa" name="Creps Urca" stackId="a" fill="#475569" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
          <div>
            <h3 className="font-display text-sm font-semibold text-slate-900 dark:text-slate-100">
              Progresso do Checklist por Área
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Atividades concluídas versus em aberto por frente operacional
            </p>
          </div>

          {taskProgressByArea.length === 0 ? (
            <div className="h-64 flex items-center justify-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-xs text-slate-500">
              Sem atividades registradas neste recorte
            </div>
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={taskProgressByArea} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis
                    type="category"
                    dataKey="categoria"
                    width={120}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#f8fafc',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="Concluidas" name="Concluídas" stackId="t" fill="#16a34a" />
                  <Bar dataKey="EmAberto" name="Em aberto" stackId="t" fill="#d97706" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
