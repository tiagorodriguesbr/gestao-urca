import React, { useMemo, useState } from 'react';
import { Edit3, Plus, Search, Trash2, X } from 'lucide-react';
import {
  formatCurrencyBRL,
  formatDateBR,
  getTodayIsoDate,
  PAYMENT_CATEGORIES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  validatePaymentPayload,
  type PartnerRecord,
  type PaymentCategory,
  type PaymentMethod,
  type PaymentStatus,
  type TransitionPayment,
} from '../types/domain';
import type { ConfirmDialogState } from './ConfirmActionModal';

interface PaymentsViewProps {
  payments: TransitionPayment[];
  partners: PartnerRecord[];
  loading: boolean;
  canEdit: boolean;
  onCreatePayment: (input: {
    description: string;
    amount: number;
    paidBy: string;
    category: PaymentCategory;
    paymentMethod: PaymentMethod;
    paymentDate: string;
    status: PaymentStatus;
    receiptRef: string;
    notes: string;
  }) => Promise<void>;
  onUpdatePayment: (
    existing: TransitionPayment,
    updates: {
      description: string;
      amount: number;
      paidBy: string;
      category: PaymentCategory;
      paymentMethod: PaymentMethod;
      paymentDate: string;
      status: PaymentStatus;
      receiptRef: string;
      notes: string;
    }
  ) => Promise<void>;
  onDeletePayment: (payment: TransitionPayment) => Promise<void>;
  requestConfirmation: (dialog: Omit<ConfirmDialogState, 'open'>) => void;
  externalOpenCreate?: boolean;
  onConsumeExternalOpenCreate?: () => void;
}

export const PaymentsView: React.FC<PaymentsViewProps> = ({
  payments,
  partners,
  loading,
  canEdit,
  onCreatePayment,
  onUpdatePayment,
  onDeletePayment,
  requestConfirmation,
  externalOpenCreate,
  onConsumeExternalOpenCreate,
}) => {
  const [payerFilter, setPayerFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | PaymentCategory>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<TransitionPayment | null>(null);

  const payerOptions = useMemo(() => {
    const set = new Set<string>();
    partners
      .filter((p) => p.active)
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'pt-BR'))
      .forEach((p) => set.add(p.displayName));
    set.add('Empresa Creps Urca');
    payments.forEach((p) => {
      if (p.paidBy.trim()) set.add(p.paidBy.trim());
    });
    return Array.from(set);
  }, [partners, payments]);

  const [description, setDescription] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [paidBy, setPaidBy] = useState<string>(payerOptions[0] || 'Empresa Creps Urca');
  const [customPaidBy, setCustomPaidBy] = useState('');
  const [category, setCategory] = useState<PaymentCategory>('Equipamentos & PDV');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX');
  const [paymentDate, setPaymentDate] = useState(getTodayIsoDate());
  const [status, setStatus] = useState<PaymentStatus>('pago');
  const [receiptRef, setReceiptRef] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  React.useEffect(() => {
    if (externalOpenCreate && canEdit) {
      openCreateModal();
      onConsumeExternalOpenCreate?.();
    }
  }, [externalOpenCreate, canEdit]);

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    payments.forEach((p) => {
      if (p.paymentDate.length >= 7) set.add(p.paymentDate.slice(0, 7));
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [payments]);

  const filteredPayments = useMemo(() => {
    return payments
      .filter((p) => {
        if (payerFilter !== 'all' && p.paidBy !== payerFilter) return false;
        if (categoryFilter !== 'all' && p.category !== categoryFilter) return false;
        if (monthFilter !== 'all' && !p.paymentDate.startsWith(monthFilter)) return false;
        if (searchTerm.trim()) {
          const q = searchTerm.toLowerCase();
          return (
            p.description.toLowerCase().includes(q) ||
            p.receiptRef.toLowerCase().includes(q) ||
            p.notes.toLowerCase().includes(q) ||
            p.paidBy.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  }, [payments, payerFilter, categoryFilter, monthFilter, searchTerm]);

  const summaryCards = useMemo(() => {
    const total = payments.reduce((s, p) => s + p.amount, 0);
    const activePartnerNames = partners
      .filter((p) => p.active)
      .map((p) => p.displayName);

    const cards: Array<{ label: string; amount: number; accent: string }> = [
      {
        label: 'Total Geral Acumulado',
        amount: total,
        accent: 'text-slate-900 dark:text-slate-50',
      },
    ];

    activePartnerNames.forEach((name, idx) => {
      const amt = payments
        .filter((p) => p.paidBy === name)
        .reduce((s, p) => s + p.amount, 0);
      cards.push({
        label: `Pago por ${name}`,
        amount: amt,
        accent:
          idx % 2 === 0
            ? 'text-teal-700 dark:text-teal-400'
            : 'text-sky-700 dark:text-sky-400',
      });
    });

    const empresaAmt = payments
      .filter((p) => p.paidBy === 'Empresa Creps Urca')
      .reduce((s, p) => s + p.amount, 0);
    cards.push({
      label: 'Conta Creps Urca',
      amount: empresaAmt,
      accent: 'text-slate-900 dark:text-slate-50',
    });

    const filteredTotal = filteredPayments.reduce((s, p) => s + p.amount, 0);
    return { cards, filteredTotal };
  }, [payments, partners, filteredPayments]);

  function openCreateModal() {
    setEditingPayment(null);
    setDescription('');
    setAmountInput('');
    setPaidBy(payerOptions[0] || 'Empresa Creps Urca');
    setCustomPaidBy('');
    setCategory('Equipamentos & PDV');
    setPaymentMethod('PIX');
    setPaymentDate(getTodayIsoDate());
    setStatus('pago');
    setReceiptRef('');
    setNotes('');
    setFormError(null);
    setModalOpen(true);
  }

  function openEditModal(payment: TransitionPayment) {
    setEditingPayment(payment);
    setDescription(payment.description);
    setAmountInput(String(payment.amount));
    if (payerOptions.includes(payment.paidBy)) {
      setPaidBy(payment.paidBy);
      setCustomPaidBy('');
    } else {
      setPaidBy('__custom__');
      setCustomPaidBy(payment.paidBy);
    }
    setCategory(payment.category);
    setPaymentMethod(payment.paymentMethod);
    setPaymentDate(payment.paymentDate);
    setStatus(payment.status);
    setReceiptRef(payment.receiptRef);
    setNotes(payment.notes);
    setFormError(null);
    setModalOpen(true);
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = Number(amountInput.replace(',', '.'));
    const resolvedPaidBy = paidBy === '__custom__' ? customPaidBy.trim() : paidBy;

    const payload = {
      description,
      amount: parsedAmount,
      paidBy: resolvedPaidBy,
      category,
      paymentMethod,
      paymentDate,
      status,
      receiptRef,
      notes,
    };
    const err = validatePaymentPayload(payload);
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);

    if (editingPayment) {
      requestConfirmation({
        title: 'Confirmar Alteração de Pagamento',
        description:
          'Confirme a atualização deste lançamento financeiro. O valor e os campos modificados serão auditados.',
        details: [
          { label: 'Descrição', value: description.trim() },
          { label: 'Valor', value: formatCurrencyBRL(parsedAmount) },
          { label: 'Pago por', value: resolvedPaidBy },
          { label: 'Data', value: formatDateBR(paymentDate) },
        ],
        confirmLabel: 'Confirmar Alteração',
        tone: 'primary',
        onConfirm: async () => {
          await onUpdatePayment(editingPayment, payload);
          setModalOpen(false);
        },
      });
    } else {
      requestConfirmation({
        title: 'Confirmar Lançamento de Pagamento',
        description:
          'Confirme o registro deste pagamento pré-operacional da Creps Urca.',
        details: [
          { label: 'Descrição', value: description.trim() },
          { label: 'Valor', value: formatCurrencyBRL(parsedAmount) },
          { label: 'Pago por', value: resolvedPaidBy },
          { label: 'Categoria', value: category },
        ],
        confirmLabel: 'Confirmar Lançamento',
        tone: 'primary',
        onConfirm: async () => {
          await onCreatePayment(payload);
          setModalOpen(false);
        },
      });
    }
  };

  const handleDelete = (payment: TransitionPayment) => {
    if (!canEdit) return;
    requestConfirmation({
      title: 'Confirmar Exclusão de Pagamento',
      description:
        'Este lançamento será removido da soma financeira. O registro da remoção permanecerá nos logs de auditoria.',
      details: [
        { label: 'Descrição', value: payment.description },
        { label: 'Valor', value: formatCurrencyBRL(payment.amount) },
        { label: 'Pago por', value: payment.paidBy },
      ],
      confirmLabel: 'Excluir Pagamento',
      tone: 'danger',
      onConfirm: async () => {
        await onDeletePayment(payment);
      },
    });
  };

  return (
    <div className="space-y-6">
      {!canEdit && (
        <div className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900 text-xs text-slate-600 dark:text-slate-300">
          <strong>Modo Somente Leitura (Gerente):</strong> visualização do histórico de pagamentos da implantação. Inclusões e edições financeiras exigem permissão liberada por um Sócio ou Diretor.
        </div>
      )}

      {/* Partner Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {summaryCards.cards.map((card) => (
          <div
            key={card.label}
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4"
          >
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{card.label}</p>
            <p className={`font-mono tabular-nums text-xl font-bold mt-1 ${card.accent}`}>
              {formatCurrencyBRL(card.amount)}
            </p>
          </div>
        ))}
      </div>

      {/* Filter & Action Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
          {(['all', ...payerOptions] as const).map((payer) => (
            <button
              key={payer}
              type="button"
              onClick={() => setPayerFilter(payer)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                payerFilter === payer
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {payer === 'all' ? 'Todos Pagadores' : payer}
            </button>
          ))}
        </div>

        {canEdit && (
          <button
            type="button"
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Registrar Pagamento
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar descrição, NF ou pagador..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
          />
        </div>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value as 'all' | PaymentCategory)}
          aria-label="Filtrar categoria financeira"
          className="px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
        >
          <option value="all">Todas as categorias</option>
          {PAYMENT_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>

        <select
          value={monthFilter}
          onChange={(e) => setMonthFilter(e.target.value)}
          aria-label="Filtrar por mês"
          className="px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm font-mono text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
        >
          <option value="all">Todos os meses</option>
          {availableMonths.map((ym) => (
            <option key={ym} value={ym}>
              {ym}
            </option>
          ))}
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-3 animate-pulse">
          <div className="h-4 w-full bg-slate-200 dark:bg-slate-800 rounded" />
          <div className="h-4 w-3/4 bg-slate-200 dark:bg-slate-800 rounded" />
        </div>
      ) : filteredPayments.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-2">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Nenhum pagamento encontrado
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Registre taxas, exames, equipamentos, sistemas ou estoque inicial pagos antes da abertura.
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-xs font-medium text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4">Descrição</th>
                  <th className="py-3 px-4">Pago Por</th>
                  <th className="py-3 px-4">Forma</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Valor</th>
                  {canEdit && <th className="py-3 px-4 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                {filteredPayments.map((payment) => (
                  <tr
                    key={payment.id}
                    className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3.5 px-4 whitespace-nowrap font-mono tabular-nums text-xs text-slate-600 dark:text-slate-300">
                      {formatDateBR(payment.paymentDate)}
                    </td>
                    <td className="py-3.5 px-4 max-w-md">
                      <p className="font-medium text-slate-900 dark:text-slate-100">
                        {payment.description}
                      </p>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span>{payment.category}</span>
                        {payment.receiptRef && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">Ref: {payment.receiptRef}</span>
                          </>
                        )}
                        {payment.hasPendingWrites && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-amber-600 dark:text-amber-400">
                              Pendente offline
                            </span>
                          </>
                        )}
                      </div>
                      {payment.notes && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                          {payment.notes}
                        </p>
                      )}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-xs font-medium text-slate-800 dark:text-slate-200">
                      {payment.paidBy}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">
                      {payment.paymentMethod}
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-xs">
                      <span
                        className={
                          payment.status === 'pago'
                            ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                            : 'text-amber-700 dark:text-amber-400 font-medium'
                        }
                      >
                        {payment.status === 'pago' ? 'Pago' : 'Agendado'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 whitespace-nowrap text-right font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                      {formatCurrencyBRL(payment.amount)}
                    </td>
                    {canEdit && (
                      <td className="py-3.5 px-4 whitespace-nowrap text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditModal(payment)}
                            aria-label={`Editar ${payment.description}`}
                            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(payment)}
                            aria-label={`Excluir ${payment.description}`}
                            className="p-2 rounded-lg text-slate-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-xs font-semibold text-slate-900 dark:text-slate-100">
                  <td colSpan={5} className="py-3 px-4 text-right">
                    Subtotal do filtro ({filteredPayments.length} itens):
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums">
                    {formatCurrencyBRL(summaryCards.filteredTotal)}
                  </td>
                  {canEdit && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalOpen && canEdit && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                {editingPayment ? 'Editar Pagamento' : 'Registrar Pagamento Pré-Operacional'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                  {formError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Descrição do pagamento *
                </label>
                <input
                  type="text"
                  required
                  maxLength={160}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex.: Taxa de implantação sistema Gcom + certificado digital"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Valor (R$) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    placeholder="0,00"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Data do pagamento *
                  </label>
                  <input
                    type="date"
                    required
                    value={paymentDate}
                    onChange={(e) => setPaymentDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Pago por
                  </label>
                  <select
                    value={paidBy}
                    onChange={(e) => setPaidBy(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                  >
                    {payerOptions.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                    <option value="__custom__">Outro pagador...</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Categoria
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as PaymentCategory)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                  >
                    {PAYMENT_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {paidBy === '__custom__' && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Nome do pagador *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={80}
                    value={customPaidBy}
                    onChange={(e) => setCustomPaidBy(e.target.value)}
                    placeholder="Informe o nome do pagador"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                  />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Meio de pagamento
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Situação
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as PaymentStatus)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                  >
                    {PAYMENT_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s === 'pago' ? 'Pago' : 'Agendado'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Comprovante / NF (opcional)
                </label>
                <input
                  type="text"
                  maxLength={120}
                  value={receiptRef}
                  onChange={(e) => setReceiptRef(e.target.value)}
                  placeholder="Ex.: NF-e 00412 ou ID PIX"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Observações (opcional)
                </label>
                <textarea
                  rows={2}
                  maxLength={600}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Detalhes para acerto de contas entre os sócios..."
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
                  {editingPayment ? 'Revisar Alteração' : 'Revisar Lançamento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
