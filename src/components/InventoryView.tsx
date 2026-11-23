import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  Lock,
  Package,
  Plus,
  Save,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  formatDateBR,
  formatIsoTimestampBR,
  formatMonthKeyBR,
  getCurrentMonthKey,
  getNextMonthKey,
  INVENTORY_CATEGORIES,
  INVENTORY_PERIOD_STATUS_LABELS,
  validateInventoryItemPayload,
  VALIDATION_LIMITS,
  type InventoryCategory,
  type InventoryItem,
  type InventoryPeriod,
} from '../types/domain';
import { getFirestoreErrorMessage } from '../lib/firebase';
import { exportInventoryPdf } from '../lib/exportUtils';
import type { ConfirmDialogState } from './ConfirmActionModal';

interface InventoryViewProps {
  periods: InventoryPeriod[];
  items: InventoryItem[];
  loading: boolean;
  canEdit: boolean;
  isFullAdmin: boolean;
  onCreatePeriod: (input: {
    monthKey: string;
    baseDate: string;
    currentDate: string;
    carryFrom?: { period: InventoryPeriod; items: InventoryItem[] } | null;
  }) => Promise<string>;
  onUpdateDatesAndValidation: (
    period: InventoryPeriod,
    input: {
      baseDate: string;
      currentDate: string;
      baseValidated: boolean;
      currentValidated: boolean;
    }
  ) => Promise<void>;
  onSyncBaseFromPrev: (
    targetPeriod: InventoryPeriod,
    targetItems: InventoryItem[],
    prevPeriod: InventoryPeriod,
    prevItems: InventoryItem[]
  ) => Promise<number>;
  onSubmitForValidation: (period: InventoryPeriod) => Promise<void>;
  onReviewPeriod: (
    period: InventoryPeriod,
    input: { decision: 'aprovado' | 'recusado'; rejectionReason: string }
  ) => Promise<void>;
  onSaveBatchCounts: (
    period: InventoryPeriod,
    updates: Array<{
      existing: InventoryItem;
      baseQty: number;
      currentQty: number;
      unit: string;
      notes: string;
    }>
  ) => Promise<void>;
  onCreateItem: (
    period: InventoryPeriod,
    input: {
      name: string;
      category: InventoryCategory;
      unit: string;
      baseQty: number;
      currentQty: number;
      notes: string;
      sortOrder: number;
    }
  ) => Promise<void>;
  onDeleteItem: (period: InventoryPeriod, item: InventoryItem) => Promise<void>;
  requestConfirmation: (dialog: Omit<ConfirmDialogState, 'open'>) => void;
}

interface DraftRow {
  unit: string;
  baseQty: string;
  currentQty: string;
  notes: string;
}

type StatusFilter = 'all' | 'filled' | 'changed' | 'zero';

function parseNum(raw: string): number {
  const normalized = raw.replace(',', '.').trim();
  if (!normalized) return 0;
  const n = Number(normalized);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

function fmtQty(n: number): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(n);
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  periods,
  items,
  loading,
  canEdit,
  isFullAdmin,
  onCreatePeriod,
  onUpdateDatesAndValidation,
  onSyncBaseFromPrev,
  onSubmitForValidation,
  onReviewPeriod,
  onSaveBatchCounts,
  onCreateItem,
  onDeleteItem,
  requestConfirmation,
}) => {
  const sortedPeriods = useMemo(
    () => [...periods].sort((a, b) => a.monthKey.localeCompare(b.monthKey)),
    [periods]
  );

  const [selectedMonthKey, setSelectedMonthKey] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | InventoryCategory>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Date & validation local inputs for the selected period
  const [baseDateInput, setBaseDateInput] = useState('');
  const [currentDateInput, setCurrentDateInput] = useState('');
  const [baseValidatedInput, setBaseValidatedInput] = useState(false);
  const [currentValidatedInput, setCurrentValidatedInput] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [actionBanner, setActionBanner] = useState<string | null>(null);

  // New Month modal state
  const [newMonthModalOpen, setNewMonthModalOpen] = useState(false);
  const [newMonthKey, setNewMonthKey] = useState(getCurrentMonthKey());
  const [newMonthBaseDate, setNewMonthBaseDate] = useState('');
  const [newMonthCurrentDate, setNewMonthCurrentDate] = useState('');
  const [carryOverFromPrev, setCarryOverFromPrev] = useState(true);
  const [newMonthError, setNewMonthError] = useState<string | null>(null);
  const [newMonthBusy, setNewMonthBusy] = useState(false);

  // Add item modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<InventoryCategory>('Proteínas');
  const [newUnit, setNewUnit] = useState('kg');
  const [newBaseQty, setNewBaseQty] = useState('0');
  const [newCurrentQty, setNewCurrentQty] = useState('0');
  const [newNotes, setNewNotes] = useState('');

  // PDF Export chooser modal state
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [pdfMode, setPdfMode] = useState<'all' | 'selected'>('all');
  const [pdfSelectedCategories, setPdfSelectedCategories] = useState<InventoryCategory[]>([
    ...INVENTORY_CATEGORIES,
  ]);

  // Rejection modal state (Sócio / Diretor)
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);

  // Auto-select a valid period when periods load or change
  useEffect(() => {
    if (sortedPeriods.length === 0) {
      setSelectedMonthKey('');
      return;
    }
    const exists = sortedPeriods.some((p) => p.monthKey === selectedMonthKey);
    if (!exists) {
      setSelectedMonthKey(sortedPeriods[sortedPeriods.length - 1].monthKey);
    }
  }, [sortedPeriods, selectedMonthKey]);

  const selectedPeriod = useMemo(
    () => sortedPeriods.find((p) => p.monthKey === selectedMonthKey) || null,
    [sortedPeriods, selectedMonthKey]
  );

  // Immediate previous existing period before selectedPeriod
  const previousPeriod = useMemo(() => {
    if (!selectedPeriod) return null;
    const earlier = sortedPeriods.filter((p) => p.monthKey < selectedPeriod.monthKey);
    return earlier.length > 0 ? earlier[earlier.length - 1] : null;
  }, [sortedPeriods, selectedPeriod]);

  // Sync local date/validation inputs when switching period or when Firestore updates
  useEffect(() => {
    setBaseDateInput(selectedPeriod?.baseDate || '');
    setCurrentDateInput(selectedPeriod?.currentDate || '');
    setBaseValidatedInput(Boolean(selectedPeriod?.baseValidated));
    setCurrentValidatedInput(Boolean(selectedPeriod?.currentValidated));
    setFormError(null);
  }, [
    selectedPeriod?.id,
    selectedPeriod?.baseDate,
    selectedPeriod?.currentDate,
    selectedPeriod?.baseValidated,
    selectedPeriod?.currentValidated,
  ]);

  // Clear drafts when switching months
  useEffect(() => {
    setDrafts({});
    setActionBanner(null);
  }, [selectedPeriod?.id]);

  const periodItems = useMemo(() => {
    if (!selectedPeriod) return [];
    return items
      .filter((i) => i.periodId === selectedPeriod.id)
      .sort((a, b) => {
        if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
        return a.name.localeCompare(b.name, 'pt-BR');
      });
  }, [items, selectedPeriod]);

  const previousPeriodItems = useMemo(() => {
    if (!previousPeriod) return [];
    return items.filter((i) => i.periodId === previousPeriod.id);
  }, [items, previousPeriod]);

  // Prune stale drafts once Firestore commits them
  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<string, DraftRow> = {};
      const byId = new Map(periodItems.map((i) => [i.id, i]));
      for (const [id, draft] of Object.entries(prev)) {
        const item = byId.get(id);
        if (!item) continue;
        const b = parseNum(draft.baseQty);
        const c = parseNum(draft.currentQty);
        const same =
          draft.unit === item.unit &&
          draft.notes === item.notes &&
          b === item.baseQty &&
          c === item.currentQty;
        if (!same) next[id] = draft;
      }
      return next;
    });
  }, [periodItems]);

  const isPeriodEditable = Boolean(
    canEdit &&
      selectedPeriod &&
      (selectedPeriod.status === 'rascunho' || selectedPeriod.status === 'recusado')
  );

  const getRowValues = (item: InventoryItem) => {
    const draft = drafts[item.id];
    const unit = draft ? draft.unit : item.unit;
    const baseStr = draft ? draft.baseQty : String(item.baseQty);
    const currentStr = draft ? draft.currentQty : String(item.currentQty);
    const notes = draft ? draft.notes : item.notes;
    const baseNum = parseNum(baseStr);
    const currentNum = parseNum(currentStr);
    return { unit, baseStr, currentStr, notes, baseNum, currentNum };
  };

  const dirtyUpdates = useMemo(() => {
    const list: Array<{
      existing: InventoryItem;
      baseQty: number;
      currentQty: number;
      unit: string;
      notes: string;
    }> = [];
    for (const item of periodItems) {
      const draft = drafts[item.id];
      if (!draft) continue;
      const b = parseNum(draft.baseQty);
      const c = parseNum(draft.currentQty);
      const cleanUnit = draft.unit.trim() || item.unit;
      const cleanNotes = draft.notes.trim();
      if (
        Number.isNaN(b) ||
        Number.isNaN(c) ||
        b !== item.baseQty ||
        c !== item.currentQty ||
        cleanUnit !== item.unit ||
        cleanNotes !== item.notes
      ) {
        list.push({
          existing: item,
          baseQty: b,
          currentQty: c,
          unit: cleanUnit,
          notes: cleanNotes,
        });
      }
    }
    return list;
  }, [periodItems, drafts]);

  const filteredItems = useMemo(() => {
    return periodItems.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      const { baseNum, currentNum } = getRowValues(item);
      if (statusFilter === 'filled' && baseNum === 0 && currentNum === 0) return false;
      if (statusFilter === 'changed' && baseNum === currentNum) return false;
      if (statusFilter === 'zero' && (baseNum !== 0 || currentNum !== 0)) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return (
          item.name.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) ||
          item.notes.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [periodItems, categoryFilter, statusFilter, searchTerm, drafts]);

  const summary = useMemo(() => {
    const total = periodItems.length;
    const filled = periodItems.filter((i) => i.baseQty > 0 || i.currentQty > 0).length;
    const varied = periodItems.filter((i) => i.baseQty !== i.currentQty).length;
    return { total, filled, varied };
  }, [periodItems]);

  const datesOrValidationChanged = Boolean(
    selectedPeriod &&
      ((baseDateInput || '') !== (selectedPeriod.baseDate || '') ||
        (currentDateInput || '') !== (selectedPeriod.currentDate || '') ||
        baseValidatedInput !== selectedPeriod.baseValidated ||
        currentValidatedInput !== selectedPeriod.currentValidated)
  );

  // Previous month match for New Month modal
  const carryCandidateForNewMonth = useMemo(() => {
    if (!VALIDATION_LIMITS.MONTH_KEY_REGEX.test(newMonthKey)) return null;
    const earlier = sortedPeriods.filter((p) => p.monthKey < newMonthKey);
    if (earlier.length === 0) return null;
    const prev = earlier[earlier.length - 1];
    return {
      period: prev,
      items: items.filter((i) => i.periodId === prev.id),
    };
  }, [sortedPeriods, items, newMonthKey]);

  useEffect(() => {
    if (!newMonthModalOpen) return;
    if (carryCandidateForNewMonth && carryOverFromPrev) {
      setNewMonthBaseDate(carryCandidateForNewMonth.period.currentDate || '');
    } else if (!carryCandidateForNewMonth) {
      setNewMonthBaseDate('');
    }
  }, [newMonthModalOpen, carryCandidateForNewMonth, carryOverFromPrev]);

  const openNewMonthDialog = () => {
    const suggestedMonth =
      sortedPeriods.length > 0
        ? getNextMonthKey(sortedPeriods[sortedPeriods.length - 1].monthKey)
        : getCurrentMonthKey();
    setNewMonthKey(suggestedMonth);
    setNewMonthCurrentDate('');
    setCarryOverFromPrev(sortedPeriods.length > 0);
    setNewMonthError(null);
    setNewMonthModalOpen(true);
  };

  const handleCreateMonthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!VALIDATION_LIMITS.MONTH_KEY_REGEX.test(newMonthKey)) {
      setNewMonthError('Selecione um mês válido.');
      return;
    }
    if (sortedPeriods.some((p) => p.monthKey === newMonthKey)) {
      setNewMonthError(`Já existe um inventário aberto para ${formatMonthKeyBR(newMonthKey)}.`);
      return;
    }
    setNewMonthError(null);
    setNewMonthBusy(true);
    try {
      const carry =
        carryOverFromPrev && carryCandidateForNewMonth ? carryCandidateForNewMonth : null;
      await onCreatePeriod({
        monthKey: newMonthKey,
        baseDate: carry ? newMonthBaseDate || carry.period.currentDate : newMonthBaseDate,
        currentDate: newMonthCurrentDate,
        carryFrom: carry,
      });
      setSelectedMonthKey(newMonthKey);
      setNewMonthModalOpen(false);
      setActionBanner(
        carry
          ? `Inventário de ${formatMonthKeyBR(newMonthKey)} iniciado puxando automaticamente Qtd. Base de ${formatMonthKeyBR(carry.period.monthKey)}.`
          : `Inventário de ${formatMonthKeyBR(newMonthKey)} criado com 114 itens prontos para contagem.`
      );
    } catch (err: unknown) {
      setNewMonthError(getFirestoreErrorMessage(err));
    } finally {
      setNewMonthBusy(false);
    }
  };

  const updateDraft = (item: InventoryItem, patch: Partial<DraftRow>) => {
    if (!isPeriodEditable) return;
    setDrafts((prev) => {
      const current = prev[item.id] || {
        unit: item.unit,
        baseQty: String(item.baseQty),
        currentQty: String(item.currentQty),
        notes: item.notes,
      };
      return {
        ...prev,
        [item.id]: { ...current, ...patch },
      };
    });
  };

  const handleSaveDatesAndValidation = () => {
    if (!isPeriodEditable || !selectedPeriod) return;
    if (baseValidatedInput && !baseDateInput) {
      setFormError('Informe a Data da Quantidade Base antes de marcá-la como validada.');
      return;
    }
    if (currentValidatedInput && !currentDateInput) {
      setFormError('Informe a Data da Quantidade Hoje antes de marcá-la como validada.');
      return;
    }
    setFormError(null);

    requestConfirmation({
      title: `Confirmar Datas e Validação (${formatMonthKeyBR(selectedPeriod.monthKey)})`,
      description:
        'As datas e status de validação ficarão visíveis nas colunas da tabela e no cabeçalho do PDF exportado.',
      details: [
        {
          label: 'Qtd. Base',
          value: `${baseDateInput ? formatDateBR(baseDateInput) : 'Não informada'} · ${
            baseValidatedInput ? 'Validada' : 'Pendente'
          }`,
        },
        {
          label: 'Qtd. Hoje',
          value: `${currentDateInput ? formatDateBR(currentDateInput) : 'Não informada'} · ${
            currentValidatedInput ? 'Validada' : 'Pendente'
          }`,
        },
      ],
      confirmLabel: 'Salvar Datas e Validações',
      tone: 'primary',
      onConfirm: async () => {
        await onUpdateDatesAndValidation(selectedPeriod, {
          baseDate: baseDateInput,
          currentDate: currentDateInput,
          baseValidated: baseValidatedInput,
          currentValidated: currentValidatedInput,
        });
      },
    });
  };

  const handleSyncBaseFromPrev = () => {
    if (!isPeriodEditable || !selectedPeriod || !previousPeriod) return;
    requestConfirmation({
      title: `Puxar Qtd. Base de ${formatMonthKeyBR(previousPeriod.monthKey)}`,
      description: `Deseja atualizar a Qtd. Base e a Data Base de ${formatMonthKeyBR(
        selectedPeriod.monthKey
      )} usando automaticamente a Qtd. Hoje apurada em ${formatMonthKeyBR(
        previousPeriod.monthKey
      )}?`,
      details: [
        {
          label: 'Origem (Qtd. Hoje)',
          value: `${formatMonthKeyBR(previousPeriod.monthKey)} · ${
            previousPeriod.currentDate ? formatDateBR(previousPeriod.currentDate) : 'Sem data'
          }`,
        },
        {
          label: 'Destino (Qtd. Base)',
          value: formatMonthKeyBR(selectedPeriod.monthKey),
        },
      ],
      confirmLabel: 'Puxar Quantidades Base',
      tone: 'primary',
      onConfirm: async () => {
        const count = await onSyncBaseFromPrev(
          selectedPeriod,
          periodItems,
          previousPeriod,
          previousPeriodItems
        );
        setDrafts({});
        setActionBanner(
          `Qtd. Base sincronizada a partir de ${formatMonthKeyBR(
            previousPeriod.monthKey
          )} (${count} item(ns) atualizado(s)). Valide a Data Base após conferir.`
        );
      },
    });
  };

  const handleSaveBatch = () => {
    if (!isPeriodEditable || !selectedPeriod || dirtyUpdates.length === 0) return;
    const invalid = dirtyUpdates.find(
      (u) =>
        Number.isNaN(u.baseQty) ||
        Number.isNaN(u.currentQty) ||
        Boolean(
          validateInventoryItemPayload({
            name: u.existing.name,
            category: u.existing.category,
            unit: u.unit,
            baseQty: u.baseQty,
            currentQty: u.currentQty,
            notes: u.notes,
          })
        )
    );
    if (invalid) {
      setFormError(
        `Verifique os valores informados em "${invalid.existing.name}". Utilize números maiores ou iguais a zero.`
      );
      return;
    }
    setFormError(null);

    requestConfirmation({
      title: `Confirmar Contagem (${formatMonthKeyBR(selectedPeriod.monthKey)})`,
      description: `Deseja salvar as alterações de ${dirtyUpdates.length} item(ns) neste inventário mensal?`,
      details: [
        { label: 'Mês', value: formatMonthKeyBR(selectedPeriod.monthKey) },
        { label: 'Itens alterados', value: `${dirtyUpdates.length} registro(s)` },
        {
          label: 'Data Qtd. Base',
          value: baseDateInput ? formatDateBR(baseDateInput) : 'Não definida',
        },
        {
          label: 'Data Qtd. Hoje',
          value: currentDateInput ? formatDateBR(currentDateInput) : 'Não definida',
        },
      ],
      confirmLabel: 'Salvar Contagem',
      tone: 'primary',
      onConfirm: async () => {
        await onSaveBatchCounts(selectedPeriod, dirtyUpdates);
      },
    });
  };

  const handleSubmitValidation = () => {
    if (!isPeriodEditable || !selectedPeriod) return;
    if (dirtyUpdates.length > 0) {
      setFormError(
        `Você possui ${dirtyUpdates.length} item(ns) com contagem alterada não salva. Clique em "Salvar Contagem" antes de enviar para validação.`
      );
      return;
    }
    if (datesOrValidationChanged) {
      setFormError(
        'Você alterou as datas ou marcações de validação. Clique em "Salvar Datas e Validações" antes de enviar.'
      );
      return;
    }
    if (!selectedPeriod.baseDate || !selectedPeriod.baseValidated) {
      setFormError(
        'Informe e valide a Data e a Quantidade Base antes de enviar o inventário para validação.'
      );
      return;
    }
    if (!selectedPeriod.currentDate || !selectedPeriod.currentValidated) {
      setFormError(
        'Informe e valide a Data e a Quantidade Hoje antes de enviar o inventário para validação.'
      );
      return;
    }
    setFormError(null);

    requestConfirmation({
      title: `Enviar Inventário de ${formatMonthKeyBR(selectedPeriod.monthKey)} para Validação`,
      description:
        'O inventário será encaminhado para conferência de Sócios e Diretores. Enquanto estiver em validação, as edições ficarão bloqueadas.',
      details: [
        {
          label: 'Qtd. Base Validada',
          value: formatDateBR(selectedPeriod.baseDate),
        },
        {
          label: 'Qtd. Hoje Validada',
          value: formatDateBR(selectedPeriod.currentDate),
        },
        {
          label: 'Itens com contagem',
          value: `${summary.filled} de ${summary.total}`,
        },
      ],
      confirmLabel: 'Enviar para Sócios e Diretores',
      tone: 'primary',
      onConfirm: async () => {
        await onSubmitForValidation(selectedPeriod);
      },
    });
  };

  const handleApprovePeriod = () => {
    if (!isFullAdmin || !selectedPeriod || selectedPeriod.status !== 'aguardando_validacao') {
      return;
    }
    requestConfirmation({
      title: `Aprovar e Bloquear Inventário (${formatMonthKeyBR(selectedPeriod.monthKey)})`,
      description:
        'ATENÇÃO: Uma vez aprovado, este inventário mensal ficará bloqueado em definitivo e não poderá mais ser alterado. Se precisar de ajustes, clique em "Recusar" antes de aprovar.',
      details: [
        { label: 'Mês de Referência', value: formatMonthKeyBR(selectedPeriod.monthKey) },
        { label: 'Data Qtd. Base', value: formatDateBR(selectedPeriod.baseDate) },
        { label: 'Data Qtd. Hoje', value: formatDateBR(selectedPeriod.currentDate) },
        { label: 'Enviado por', value: selectedPeriod.submittedByName || 'Equipe' },
      ],
      confirmLabel: 'Aprovar e Bloquear em Definitivo',
      tone: 'primary',
      onConfirm: async () => {
        await onReviewPeriod(selectedPeriod, {
          decision: 'aprovado',
          rejectionReason: '',
        });
      },
    });
  };

  const handleRejectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFullAdmin || !selectedPeriod || selectedPeriod.status !== 'aguardando_validacao') {
      return;
    }
    setReviewBusy(true);
    try {
      await onReviewPeriod(selectedPeriod, {
        decision: 'recusado',
        rejectionReason,
      });
      setRejectModalOpen(false);
      setRejectionReason('');
    } finally {
      setReviewBusy(false);
    }
  };

  const handleCreateItemSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isPeriodEditable || !selectedPeriod) return;
    const baseNum = parseNum(newBaseQty);
    const currentNum = parseNum(newCurrentQty);
    const payload = {
      name: newName,
      category: newCategory,
      unit: newUnit,
      baseQty: baseNum,
      currentQty: currentNum,
      notes: newNotes,
      sortOrder: periodItems.length + 1,
    };
    const err = validateInventoryItemPayload(payload);
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);

    requestConfirmation({
      title: 'Confirmar Inclusão no Inventário',
      description: `Deseja adicionar este item ao inventário de ${formatMonthKeyBR(
        selectedPeriod.monthKey
      )}?`,
      details: [
        { label: 'Item', value: newName.trim() },
        { label: 'Categoria', value: newCategory },
        { label: 'Unidade', value: newUnit.trim() },
      ],
      confirmLabel: 'Incluir Item',
      tone: 'primary',
      onConfirm: async () => {
        await onCreateItem(selectedPeriod, payload);
        setCreateOpen(false);
        setNewName('');
        setNewBaseQty('0');
        setNewCurrentQty('0');
        setNewNotes('');
      },
    });
  };

  const handleDeleteRow = (item: InventoryItem) => {
    if (!isPeriodEditable || !selectedPeriod) return;
    requestConfirmation({
      title: 'Confirmar Exclusão de Item do Inventário',
      description: `Deseja remover "${item.name}" (${item.category}) do mês ${formatMonthKeyBR(
        selectedPeriod.monthKey
      )}?`,
      details: [
        { label: 'Item', value: item.name },
        { label: 'Qtd. Base', value: `${fmtQty(item.baseQty)} ${item.unit}` },
        { label: 'Qtd. Hoje', value: `${fmtQty(item.currentQty)} ${item.unit}` },
      ],
      confirmLabel: 'Excluir Item',
      tone: 'danger',
      onConfirm: async () => {
        await onDeleteItem(selectedPeriod, item);
      },
    });
  };

  const openPdfDialog = () => {
    if (!selectedPeriod) return;
    if (categoryFilter === 'all') {
      setPdfMode('all');
      setPdfSelectedCategories([...INVENTORY_CATEGORIES]);
    } else {
      setPdfMode('selected');
      setPdfSelectedCategories([categoryFilter]);
    }
    setPdfModalOpen(true);
  };

  const togglePdfCategory = (cat: InventoryCategory) => {
    setPdfSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleConfirmExportPdf = () => {
    if (!selectedPeriod) return;
    const chosenCats =
      pdfMode === 'all' ? [...INVENTORY_CATEGORIES] : pdfSelectedCategories;
    if (chosenCats.length === 0) return;

    const exportItems = periodItems.filter((item) => chosenCats.includes(item.category));
    const selectedCategoriesLabel =
      pdfMode === 'all' || chosenCats.length === INVENTORY_CATEGORIES.length
        ? 'Todas as categorias (10)'
        : chosenCats.join(', ');

    exportInventoryPdf({
      items: exportItems,
      period: {
        ...selectedPeriod,
        baseDate: baseDateInput || selectedPeriod.baseDate,
        currentDate: currentDateInput || selectedPeriod.currentDate,
        baseValidated: baseValidatedInput,
        currentValidated: currentValidatedInput,
      },
      selectedCategoriesLabel,
    });
    setPdfModalOpen(false);
  };

  const pendingValidationCount = useMemo(
    () => sortedPeriods.filter((p) => p.status === 'aguardando_validacao').length,
    [sortedPeriods]
  );

  return (
    <div className="space-y-6">
      {!canEdit && (
        <div className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900 text-xs text-slate-600 dark:text-slate-300">
          <strong>Modo Somente Leitura (Gerente):</strong> você pode consultar os meses fechados ou em andamento e exportar o PDF por categoria ou completo. Alterações exigem permissão de edição.
        </div>
      )}

      {isFullAdmin && pendingValidationCount > 0 && (
        <div className="px-4 py-3 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 flex flex-wrap items-center justify-between gap-3 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
            <span>
              <strong>Atenção Sócios e Diretores:</strong> há {pendingValidationCount} inventário(s) aguardando sua aprovação ou recusa.
            </span>
          </div>
          {selectedPeriod?.status !== 'aguardando_validacao' && (
            <button
              type="button"
              onClick={() => {
                const pending = sortedPeriods.find((p) => p.status === 'aguardando_validacao');
                if (pending) setSelectedMonthKey(pending.monthKey);
              }}
              className="px-3 py-1.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white font-semibold transition-colors"
            >
              Ver inventário pendente
            </button>
          )}
        </div>
      )}

      {/* Month-by-Month Tabs Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Inventário Mensal de Ingredientes &amp; Insumos
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Separe os fechamentos mês a mês, valide as datas Base/Hoje e envie para aprovação de Sócios e Diretores.
            </p>
          </div>

          {canEdit && (
            <button
              type="button"
              onClick={openNewMonthDialog}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              Iniciar Novo Mês
            </button>
          )}
        </div>

        {sortedPeriods.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
            {sortedPeriods.map((period) => {
              const isSelected = period.monthKey === selectedMonthKey;
              const statusColor =
                period.status === 'aprovado'
                  ? 'text-emerald-700 dark:text-emerald-400'
                  : period.status === 'aguardando_validacao'
                  ? 'text-amber-700 dark:text-amber-400'
                  : period.status === 'recusado'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-slate-500 dark:text-slate-400';

              return (
                <button
                  key={period.id}
                  type="button"
                  onClick={() => setSelectedMonthKey(period.monthKey)}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                    isSelected
                      ? 'border-teal-600 bg-teal-50/70 dark:bg-teal-950/50 text-teal-900 dark:text-teal-200 font-semibold'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                  }`}
                >
                  {period.status === 'aprovado' && (
                    <Lock className="w-3.5 h-3.5 text-emerald-700 dark:text-emerald-400" />
                  )}
                  {period.status === 'aguardando_validacao' && (
                    <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  )}
                  {period.status === 'recusado' && (
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                  )}
                  <span>{formatMonthKeyBR(period.monthKey)}</span>
                  <span className={`text-[11px] font-normal ${statusColor}`}>
                    · {INVENTORY_PERIOD_STATUS_LABELS[period.status]}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {actionBanner && (
        <div className="px-4 py-3 rounded-xl border border-teal-200 dark:border-teal-900 bg-teal-50/60 dark:bg-teal-950/30 flex items-center justify-between gap-3 text-xs text-teal-900 dark:text-teal-200">
          <span>{actionBanner}</span>
          <button
            type="button"
            onClick={() => setActionBanner(null)}
            className="text-teal-700 dark:text-teal-400 hover:opacity-75"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Empty Onboarding when no months exist */}
      {!loading && sortedPeriods.length === 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-4">
          <Package className="w-8 h-8 text-teal-700 dark:text-teal-400 mx-auto" />
          <div className="space-y-1">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Nenhum inventário mensal iniciado ainda
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
              Inicie o primeiro mês do inventário com a base completa de 114 ingredientes e embalagens nas 10 categorias. Nos meses seguintes, a Quantidade Base puxa automaticamente a Quantidade Hoje do mês anterior.
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={openNewMonthDialog}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white text-xs font-semibold transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              Iniciar Primeiro Mês (114 itens)
            </button>
          )}
        </div>
      )}

      {/* Selected Month Workspace */}
      {selectedPeriod && (
        <>
          {/* Approval / Status Banner */}
          {selectedPeriod.status === 'aprovado' && (
            <div className="p-4 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 flex items-start gap-3">
              <Lock className="w-5 h-5 text-emerald-700 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5 text-xs">
                <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                  Inventário de {formatMonthKeyBR(selectedPeriod.monthKey)} aprovado e bloqueado em definitivo
                </p>
                <p className="text-emerald-800 dark:text-emerald-300">
                  Validado por <strong>{selectedPeriod.reviewedByName || 'Sócio/Diretor'}</strong> em{' '}
                  <span className="font-mono">{formatIsoTimestampBR(selectedPeriod.reviewedAtIso)}</span>.
                  Alterações não são mais permitidas neste mês.
                </p>
              </div>
            </div>
          )}

          {selectedPeriod.status === 'aguardando_validacao' && (
            <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="flex items-start gap-3 text-xs">
                <Clock className="w-5 h-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <p className="font-semibold text-amber-950 dark:text-amber-200">
                    Aguardando validação de Sócios e Diretores
                  </p>
                  <p className="text-amber-900 dark:text-amber-300">
                    Enviado por <strong>{selectedPeriod.submittedByName || 'Equipe'}</strong> em{' '}
                    <span className="font-mono">{formatIsoTimestampBR(selectedPeriod.submittedAtIso)}</span>.
                    {isFullAdmin
                      ? ' Confira as quantidades e datas abaixo: se precisar ajustar algo, clique em Recusar.'
                      : ' As contagens ficam bloqueadas enquanto aguardam revisão.'}
                  </p>
                </div>
              </div>

              {isFullAdmin && (
                <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setRejectionReason('');
                      setRejectModalOpen(true);
                    }}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-red-300 dark:border-red-800 bg-white dark:bg-slate-900 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold text-red-700 dark:text-red-300 transition-colors whitespace-nowrap"
                  >
                    <XCircle className="w-4 h-4" />
                    Recusar p/ Ajustes
                  </button>
                  <button
                    type="button"
                    onClick={handleApprovePeriod}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Aprovar e Bloquear
                  </button>
                </div>
              )}
            </div>
          )}

          {selectedPeriod.status === 'recusado' && (
            <div className="p-4 rounded-xl border border-red-300 dark:border-red-900 bg-red-50/70 dark:bg-red-950/30 flex items-start gap-3 text-xs">
              <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="font-semibold text-red-900 dark:text-red-200">
                  Validação recusada por {selectedPeriod.reviewedByName || 'Sócio/Diretor'} — Aberto para ajustes
                </p>
                <p className="text-red-800 dark:text-red-300">
                  <strong>Motivo:</strong> {selectedPeriod.rejectionReason || 'Ajustes solicitados.'}
                </p>
              </div>
            </div>
          )}

          {/* Period Controls, Dates & Validation Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-5">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                    {formatMonthKeyBR(selectedPeriod.monthKey)}
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    · {summary.total} itens · {summary.filled} preenchidos · {summary.varied} com variação
                  </span>
                </div>
                {selectedPeriod.carriedFromMonth && (
                  <p className="text-xs text-teal-700 dark:text-teal-400">
                    Qtd. Base inicial puxada de{' '}
                    <strong>{formatMonthKeyBR(selectedPeriod.carriedFromMonth)}</strong>.
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                <button
                  type="button"
                  onClick={openPdfDialog}
                  disabled={periodItems.length === 0}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 transition-colors whitespace-nowrap disabled:opacity-50"
                >
                  <FileText className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                  Exportar PDF
                </button>

                {isPeriodEditable && previousPeriod && (
                  <button
                    type="button"
                    onClick={handleSyncBaseFromPrev}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 transition-colors whitespace-nowrap"
                  >
                    <ArrowDownToLine className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                    Puxar Base de {formatMonthKeyBR(previousPeriod.monthKey)}
                  </button>
                )}

                {isPeriodEditable && (
                  <button
                    type="button"
                    onClick={() => {
                      setFormError(null);
                      setCreateOpen(true);
                    }}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 transition-colors whitespace-nowrap"
                  >
                    <Plus className="w-4 h-4" />
                    Novo Item
                  </button>
                )}

                {isPeriodEditable && (
                  <button
                    type="button"
                    onClick={handleSubmitValidation}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Enviar para Validação
                  </button>
                )}
              </div>
            </div>

            {/* Base Date & Current Date Validation Boxes */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
              {/* Qtd. Base Date + Validation */}
              <div className="lg:col-span-4 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                    <Calendar className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                    Data da Qtd. Base
                  </label>
                  <span
                    className={`text-[11px] font-semibold ${
                      baseValidatedInput && baseDateInput
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {baseValidatedInput && baseDateInput
                      ? `Validada (${formatDateBR(baseDateInput)})`
                      : 'Pendente de validação'}
                  </span>
                </div>
                <input
                  type="date"
                  disabled={!isPeriodEditable}
                  value={baseDateInput}
                  onChange={(e) => {
                    setBaseDateInput(e.target.value);
                    setBaseValidatedInput(false);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono text-slate-900 dark:text-slate-100 disabled:opacity-60 focus:border-teal-600 focus:outline-none"
                />
                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    disabled={!isPeriodEditable || !baseDateInput}
                    checked={baseValidatedInput}
                    onChange={(e) => setBaseValidatedInput(e.target.checked)}
                    className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                  />
                  <span>Validar quantidade e data Base</span>
                </label>
              </div>

              {/* Qtd. Hoje Date + Validation */}
              <div className="lg:col-span-4 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200">
                    <Calendar className="w-3.5 h-3.5 text-teal-700 dark:text-teal-400" />
                    Data da Qtd. Hoje
                  </label>
                  <span
                    className={`text-[11px] font-semibold ${
                      currentValidatedInput && currentDateInput
                        ? 'text-emerald-700 dark:text-emerald-400'
                        : 'text-amber-700 dark:text-amber-400'
                    }`}
                  >
                    {currentValidatedInput && currentDateInput
                      ? `Validada (${formatDateBR(currentDateInput)})`
                      : 'Pendente de validação'}
                  </span>
                </div>
                <input
                  type="date"
                  disabled={!isPeriodEditable}
                  value={currentDateInput}
                  onChange={(e) => {
                    setCurrentDateInput(e.target.value);
                    setCurrentValidatedInput(false);
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-mono text-slate-900 dark:text-slate-100 disabled:opacity-60 focus:border-teal-600 focus:outline-none"
                />
                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    disabled={!isPeriodEditable || !currentDateInput}
                    checked={currentValidatedInput}
                    onChange={(e) => setCurrentValidatedInput(e.target.checked)}
                    className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                  />
                  <span>Validar quantidade e data Hoje</span>
                </label>
              </div>

              {/* Save Dates/Validation + Save Batch Counts */}
              <div className="lg:col-span-4 flex flex-col items-stretch sm:items-end justify-end gap-2">
                {isPeriodEditable && (
                  <button
                    type="button"
                    disabled={!datesOrValidationChanged}
                    onClick={handleSaveDatesAndValidation}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 disabled:opacity-45 transition-colors whitespace-nowrap"
                  >
                    <CheckCircle2 className="w-4 h-4 text-teal-700 dark:text-teal-400" />
                    Salvar Datas e Validações
                  </button>
                )}

                {isPeriodEditable && dirtyUpdates.length > 0 && (
                  <button
                    type="button"
                    onClick={handleSaveBatch}
                    className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white text-xs font-semibold transition-colors whitespace-nowrap"
                  >
                    <Save className="w-4 h-4" />
                    Salvar Contagem ({dirtyUpdates.length})
                  </button>
                )}
              </div>
            </div>
          </div>

          {formError && !createOpen && (
            <div className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
              {formError}
            </div>
          )}

          {/* Category Tabs + Search Filters */}
          <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg">
            <button
              type="button"
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                categoryFilter === 'all'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              Todas ({periodItems.length})
            </button>
            {INVENTORY_CATEGORIES.map((cat) => {
              const count = periodItems.filter((i) => i.category === cat).length;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    categoryFilter === cat
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {cat} ({count})
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar ingrediente, embalagem ou observação..."
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              aria-label="Filtrar itens por preenchimento"
              className="px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
            >
              <option value="all">Todos os itens</option>
              <option value="filled">Apenas preenchidos (&gt; 0)</option>
              <option value="changed">Com variação (Hoje &ne; Base)</option>
              <option value="zero">Apenas zerados</option>
            </select>
          </div>

          {/* Inventory Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-4">Ingrediente / Item</th>
                    <th className="py-3 px-4">Categoria</th>
                    <th className="py-3 px-4 w-24">Unid.</th>
                    <th className="py-3 px-4 text-right w-40">
                      <span className="block text-slate-700 dark:text-slate-200 font-semibold">
                        Qtd. Base
                      </span>
                      <span
                        className={`inline-flex items-center justify-end gap-1 font-mono text-[11px] ${
                          baseDateInput
                            ? baseValidatedInput
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {baseDateInput ? formatDateBR(baseDateInput) : 'Definir data'}
                        {baseDateInput && baseValidatedInput && (
                          <CheckCircle2 className="w-3 h-3" />
                        )}
                      </span>
                    </th>
                    <th className="py-3 px-4 text-right w-40">
                      <span className="block text-slate-700 dark:text-slate-200 font-semibold">
                        Qtd. Hoje
                      </span>
                      <span
                        className={`inline-flex items-center justify-end gap-1 font-mono text-[11px] ${
                          currentDateInput
                            ? currentValidatedInput
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {currentDateInput ? formatDateBR(currentDateInput) : 'Definir data'}
                        {currentDateInput && currentValidatedInput && (
                          <CheckCircle2 className="w-3 h-3" />
                        )}
                      </span>
                    </th>
                    <th className="py-3 px-4 text-right whitespace-nowrap">Variação</th>
                    <th className="py-3 px-4 min-w-[160px]">Observação</th>
                    {isPeriodEditable && <th className="py-3 px-4 text-right">Ação</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                  {filteredItems.map((item) => {
                    const row = getRowValues(item);
                    const diff =
                      !Number.isNaN(row.baseNum) && !Number.isNaN(row.currentNum)
                        ? Math.round((row.currentNum - row.baseNum) * 1000) / 1000
                        : 0;
                    const isDirty = Boolean(drafts[item.id]);

                    return (
                      <tr
                        key={item.id}
                        className={`transition-colors ${
                          isDirty
                            ? 'bg-teal-50/40 dark:bg-teal-950/20'
                            : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <td className="py-2.5 px-4 font-medium text-slate-900 dark:text-slate-100">
                          {item.name}
                          {item.hasPendingWrites && (
                            <span className="ml-2 text-[11px] text-amber-600 dark:text-amber-400">
                              · Pendente
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {item.category}
                        </td>
                        <td className="py-2.5 px-4">
                          {isPeriodEditable ? (
                            <input
                              type="text"
                              maxLength={20}
                              value={row.unit}
                              onChange={(e) => updateDraft(item, { unit: e.target.value })}
                              className="w-16 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200 focus:border-teal-600 focus:outline-none"
                            />
                          ) : (
                            <span className="text-xs text-slate-600 dark:text-slate-300">
                              {item.unit}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          {isPeriodEditable ? (
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              value={row.baseStr}
                              onChange={(e) => updateDraft(item, { baseQty: e.target.value })}
                              className="w-28 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-right font-mono tabular-nums text-xs text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                            />
                          ) : (
                            <span className="font-mono tabular-nums text-xs text-slate-800 dark:text-slate-200">
                              {fmtQty(item.baseQty)}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right">
                          {isPeriodEditable ? (
                            <input
                              type="number"
                              step="0.001"
                              min="0"
                              value={row.currentStr}
                              onChange={(e) => updateDraft(item, { currentQty: e.target.value })}
                              className="w-28 px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-right font-mono tabular-nums text-xs text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                            />
                          ) : (
                            <span className="font-mono tabular-nums text-xs text-slate-800 dark:text-slate-200">
                              {fmtQty(item.currentQty)}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono tabular-nums text-xs whitespace-nowrap">
                          <span
                            className={
                              diff > 0
                                ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                                : diff < 0
                                ? 'text-red-600 dark:text-red-400 font-semibold'
                                : 'text-slate-400'
                            }
                          >
                            {diff > 0 ? `+${fmtQty(diff)}` : fmtQty(diff)}
                          </span>
                        </td>
                        <td className="py-2.5 px-4">
                          {isPeriodEditable ? (
                            <input
                              type="text"
                              maxLength={300}
                              value={row.notes}
                              onChange={(e) => updateDraft(item, { notes: e.target.value })}
                              placeholder="Obs..."
                              className="w-full px-2.5 py-1 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs text-slate-800 dark:text-slate-200 focus:border-teal-600 focus:outline-none"
                            />
                          ) : (
                            <span className="text-xs text-slate-500 dark:text-slate-400">
                              {item.notes || '—'}
                            </span>
                          )}
                        </td>
                        {isPeriodEditable && (
                          <td className="py-2.5 px-4 text-right">
                            <button
                              type="button"
                              onClick={() => handleDeleteRow(item)}
                              aria-label={`Remover ${item.name}`}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {isPeriodEditable && dirtyUpdates.length > 0 && (
            <div className="sticky bottom-4 z-20 flex items-center justify-between gap-4 px-5 py-3.5 rounded-xl bg-slate-900 dark:bg-slate-800 text-white shadow-lg border border-slate-700">
              <span className="text-xs font-medium">
                {dirtyUpdates.length} item(ns) com contagem alterada pendente de gravação
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDrafts({})}
                  className="px-3 py-1.5 rounded-lg border border-slate-600 text-xs font-medium text-slate-200 hover:bg-slate-700"
                >
                  Descartar
                </button>
                <button
                  type="button"
                  onClick={handleSaveBatch}
                  className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold"
                >
                  <Save className="w-3.5 h-3.5" />
                  Salvar Contagem
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* New Month Modal */}
      {newMonthModalOpen && canEdit && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Iniciar Inventário Mensal
              </h3>
              <button
                type="button"
                onClick={() => setNewMonthModalOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleCreateMonthSubmit(e)} className="p-6 space-y-4">
              {newMonthError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                  {newMonthError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Mês de referência *
                </label>
                <input
                  type="month"
                  required
                  value={newMonthKey}
                  onChange={(e) => setNewMonthKey(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                />
              </div>

              {carryCandidateForNewMonth && (
                <label className="flex items-start gap-2.5 p-3 rounded-lg border border-teal-200 dark:border-teal-900 bg-teal-50/50 dark:bg-teal-950/30 text-xs text-slate-800 dark:text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={carryOverFromPrev}
                    onChange={(e) => setCarryOverFromPrev(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                  />
                  <span>
                    <strong>
                      Puxar Qtd. Base automaticamente de{' '}
                      {formatMonthKeyBR(carryCandidateForNewMonth.period.monthKey)}
                    </strong>
                    <span className="block text-slate-600 dark:text-slate-400 mt-0.5">
                      A Qtd. Hoje de{' '}
                      {carryCandidateForNewMonth.period.currentDate
                        ? formatDateBR(carryCandidateForNewMonth.period.currentDate)
                        : 'fechamento anterior'}{' '}
                      será copiada como Qtd. Base inicial deste mês.
                    </span>
                  </span>
                </label>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Data Qtd. Base (opcional)
                  </label>
                  <input
                    type="date"
                    value={newMonthBaseDate}
                    onChange={(e) => setNewMonthBaseDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Data Qtd. Hoje (opcional)
                  </label>
                  <input
                    type="date"
                    value={newMonthCurrentDate}
                    onChange={(e) => setNewMonthCurrentDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-mono text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  disabled={newMonthBusy}
                  onClick={() => setNewMonthModalOpen(false)}
                  className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={newMonthBusy}
                  className="px-4 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white text-sm font-semibold disabled:opacity-60"
                >
                  {newMonthBusy ? 'Criando...' : 'Iniciar Mês'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Export PDF Category Chooser Modal */}
      {pdfModalOpen && selectedPeriod && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Exportar PDF — {formatMonthKeyBR(selectedPeriod.monthKey)}
              </h3>
              <button
                type="button"
                onClick={() => setPdfModalOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <input
                    type="radio"
                    name="pdfExportMode"
                    checked={pdfMode === 'all'}
                    onChange={() => setPdfMode('all')}
                    className="text-teal-700 focus:ring-teal-600"
                  />
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                    Tudo — Exportar todas as categorias ({periodItems.length} itens)
                  </span>
                </label>

                <label className="flex items-center gap-2.5 p-3 rounded-lg border border-slate-200 dark:border-slate-800 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <input
                    type="radio"
                    name="pdfExportMode"
                    checked={pdfMode === 'selected'}
                    onChange={() => setPdfMode('selected')}
                    className="text-teal-700 focus:ring-teal-600"
                  />
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
                    Escolher por categoria(s)
                  </span>
                </label>
              </div>

              {pdfMode === 'selected' && (
                <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300">
                      Categorias incluídas:
                    </span>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setPdfSelectedCategories([...INVENTORY_CATEGORIES])}
                        className="text-teal-700 dark:text-teal-400 hover:underline"
                      >
                        Marcar todas
                      </button>
                      <button
                        type="button"
                        onClick={() => setPdfSelectedCategories([])}
                        className="text-slate-500 hover:underline"
                      >
                        Limpar
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {INVENTORY_CATEGORIES.map((cat) => {
                      const count = periodItems.filter((i) => i.category === cat).length;
                      const checked = pdfSelectedCategories.includes(cat);
                      return (
                        <label
                          key={cat}
                          className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-700 dark:text-slate-300 cursor-pointer"
                        >
                          <span className="flex items-center gap-2 truncate">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => togglePdfCategory(cat)}
                              className="rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                            />
                            <span className="truncate">{cat}</span>
                          </span>
                          <span className="font-mono text-[11px] text-slate-400">{count}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPdfModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={pdfMode === 'selected' && pdfSelectedCategories.length === 0}
                  onClick={handleConfirmExportPdf}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white text-xs font-semibold disabled:opacity-50"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Gerar PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Inventory Modal (Sócios & Diretores) */}
      {rejectModalOpen && selectedPeriod && isFullAdmin && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Recusar Validação — {formatMonthKeyBR(selectedPeriod.monthKey)}
              </h3>
              <button
                type="button"
                onClick={() => setRejectModalOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleRejectSubmit(e)} className="p-6 space-y-4">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Ao recusar, o inventário retorna para ajustes para que a equipe possa corrigir contagens ou datas antes de reenviar para validação final.
              </p>
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Motivo / O que precisa ser ajustado *
                </label>
                <textarea
                  required
                  rows={3}
                  maxLength={300}
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Ex.: Conferir novamente peso da muçarela e informar data da Qtd. Hoje."
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  disabled={reviewBusy}
                  onClick={() => setRejectModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={reviewBusy}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold disabled:opacity-60"
                >
                  {reviewBusy ? 'Devolvendo...' : 'Recusar e Liberar Ajustes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Item Modal */}
      {createOpen && isPeriodEditable && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xl">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Novo Item no Inventário
              </h3>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateItemSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                  {formError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Nome do ingrediente / item *
                </label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Ex.: Frango desfiado"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Categoria
                  </label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as InventoryCategory)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                  >
                    {INVENTORY_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Unidade *
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={20}
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    placeholder="kg, und, pct, cx"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Qtd. Base
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={newBaseQty}
                    onChange={(e) => setNewBaseQty(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Qtd. Hoje
                  </label>
                  <input
                    type="number"
                    step="0.001"
                    min="0"
                    value={newCurrentQty}
                    onChange={(e) => setNewCurrentQty(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono tabular-nums text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Observação (opcional)
                </label>
                <input
                  type="text"
                  maxLength={300}
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm text-slate-900 dark:text-slate-100 focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="px-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white text-sm font-semibold"
                >
                  Revisar Inclusão
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
