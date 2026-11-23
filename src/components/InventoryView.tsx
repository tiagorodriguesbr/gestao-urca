import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  FileText,
  Package,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  formatDateBR,
  INVENTORY_CATEGORIES,
  validateInventoryItemPayload,
  type InventoryCategory,
  type InventoryItem,
  type InventoryMeta,
} from '../types/domain';
import { exportInventoryPdf } from '../lib/exportUtils';
import type { ConfirmDialogState } from './ConfirmActionModal';

interface InventoryViewProps {
  items: InventoryItem[];
  meta: InventoryMeta | null;
  loading: boolean;
  canEdit: boolean;
  onSaveMeta: (input: { baseDate: string; currentDate: string }) => Promise<void>;
  onSeedCatalog: () => Promise<void>;
  onSaveBatchCounts: (
    updates: Array<{
      existing: InventoryItem;
      baseQty: number;
      currentQty: number;
      unit: string;
      notes: string;
    }>
  ) => Promise<void>;
  onCreateItem: (input: {
    name: string;
    category: InventoryCategory;
    unit: string;
    baseQty: number;
    currentQty: number;
    notes: string;
    sortOrder: number;
  }) => Promise<void>;
  onDeleteItem: (item: InventoryItem) => Promise<void>;
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
  items,
  meta,
  loading,
  canEdit,
  onSaveMeta,
  onSeedCatalog,
  onSaveBatchCounts,
  onCreateItem,
  onDeleteItem,
  requestConfirmation,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<'all' | InventoryCategory>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const [baseDateInput, setBaseDateInput] = useState(meta?.baseDate || '');
  const [currentDateInput, setCurrentDateInput] = useState(meta?.currentDate || '');
  const [drafts, setDrafts] = useState<Record<string, DraftRow>>({});

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<InventoryCategory>('Proteínas');
  const [newUnit, setNewUnit] = useState('kg');
  const [newBaseQty, setNewBaseQty] = useState('0');
  const [newCurrentQty, setNewCurrentQty] = useState('0');
  const [newNotes, setNewNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setBaseDateInput(meta?.baseDate || '');
    setCurrentDateInput(meta?.currentDate || '');
  }, [meta?.baseDate, meta?.currentDate]);

  // Clear stale drafts when items update from Firestore
  useEffect(() => {
    setDrafts((prev) => {
      const next: Record<string, DraftRow> = {};
      const byId = new Map(items.map((i) => [i.id, i]));
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
  }, [items]);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name, 'pt-BR');
    });
  }, [items]);

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
    for (const item of sortedItems) {
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
  }, [sortedItems, drafts]);

  const filteredItems = useMemo(() => {
    return sortedItems.filter((item) => {
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
  }, [sortedItems, categoryFilter, statusFilter, searchTerm, drafts]);

  const summary = useMemo(() => {
    const total = sortedItems.length;
    const filled = sortedItems.filter((i) => i.baseQty > 0 || i.currentQty > 0).length;
    const varied = sortedItems.filter((i) => i.baseQty !== i.currentQty).length;
    return { total, filled, varied };
  }, [sortedItems]);

  const datesChanged =
    (baseDateInput || '') !== (meta?.baseDate || '') ||
    (currentDateInput || '') !== (meta?.currentDate || '');

  const updateDraft = (item: InventoryItem, patch: Partial<DraftRow>) => {
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

  const handleSaveDates = () => {
    if (!canEdit) return;
    requestConfirmation({
      title: 'Confirmar Datas do Inventário',
      description:
        'As datas informadas identificam os dois levantamentos (Quantidade Base e Quantidade Hoje) na tabela e nos PDFs exportados.',
      details: [
        {
          label: 'Data Quantidade Base',
          value: baseDateInput ? formatDateBR(baseDateInput) : 'Não informada',
        },
        {
          label: 'Data Quantidade Hoje',
          value: currentDateInput ? formatDateBR(currentDateInput) : 'Não informada',
        },
      ],
      confirmLabel: 'Salvar Datas',
      tone: 'primary',
      onConfirm: async () => {
        await onSaveMeta({
          baseDate: baseDateInput,
          currentDate: currentDateInput,
        });
      },
    });
  };

  const handleSeedClick = () => {
    if (!canEdit) return;
    requestConfirmation({
      title: 'Carregar Base Completa do Restaurante',
      description:
        'Serão incluídos os 114 ingredientes e embalagens nas 10 categorias operacionais (Proteínas, Queijos, Estoque Seco, Hortifruti, Doces, Embalagem, Congelados, Molhos, Delivery e Polpas).',
      details: [
        { label: 'Itens', value: '114 produtos pré-cadastrados' },
        { label: 'Quantidades iniciais', value: '0 (prontos para contagem)' },
      ],
      confirmLabel: 'Carregar Base Agora',
      tone: 'primary',
      onConfirm: async () => {
        await onSeedCatalog();
      },
    });
  };

  const handleSaveBatch = () => {
    if (!canEdit || dirtyUpdates.length === 0) return;
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
      title: 'Confirmar Atualização de Contagem',
      description: `Deseja salvar as alterações de quantidade de ${dirtyUpdates.length} item(ns) no inventário?`,
      details: [
        { label: 'Itens alterados', value: `${dirtyUpdates.length} registro(s)` },
        {
          label: 'Data Base',
          value: meta?.baseDate ? formatDateBR(meta.baseDate) : 'Não definida',
        },
        {
          label: 'Data Hoje',
          value: meta?.currentDate ? formatDateBR(meta.currentDate) : 'Não definida',
        },
      ],
      confirmLabel: 'Salvar Contagem',
      tone: 'primary',
      onConfirm: async () => {
        await onSaveBatchCounts(dirtyUpdates);
      },
    });
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const baseNum = parseNum(newBaseQty);
    const currentNum = parseNum(newCurrentQty);
    const payload = {
      name: newName,
      category: newCategory,
      unit: newUnit,
      baseQty: baseNum,
      currentQty: currentNum,
      notes: newNotes,
      sortOrder: sortedItems.length + 1,
    };
    const err = validateInventoryItemPayload(payload);
    if (err) {
      setFormError(err);
      return;
    }
    setFormError(null);

    requestConfirmation({
      title: 'Confirmar Inclusão no Inventário',
      description: 'Deseja adicionar este novo item à lista de contagem do estoque?',
      details: [
        { label: 'Item', value: newName.trim() },
        { label: 'Categoria', value: newCategory },
        { label: 'Unidade', value: newUnit.trim() },
      ],
      confirmLabel: 'Incluir Item',
      tone: 'primary',
      onConfirm: async () => {
        await onCreateItem(payload);
        setCreateOpen(false);
        setNewName('');
        setNewBaseQty('0');
        setNewCurrentQty('0');
        setNewNotes('');
      },
    });
  };

  const handleDeleteRow = (item: InventoryItem) => {
    if (!canEdit) return;
    requestConfirmation({
      title: 'Confirmar Exclusão de Item do Inventário',
      description: `Deseja remover "${item.name}" (${item.category}) do inventário?`,
      details: [
        { label: 'Item', value: item.name },
        { label: 'Qtd. Base', value: `${fmtQty(item.baseQty)} ${item.unit}` },
        { label: 'Qtd. Hoje', value: `${fmtQty(item.currentQty)} ${item.unit}` },
      ],
      confirmLabel: 'Excluir Item',
      tone: 'danger',
      onConfirm: async () => {
        await onDeleteItem(item);
      },
    });
  };

  const handleExportPdf = () => {
    exportInventoryPdf({
      items: filteredItems,
      meta: {
        id: meta?.id || 'creps-urca',
        workspaceId: 'creps-urca',
        baseDate: baseDateInput || meta?.baseDate || '',
        currentDate: currentDateInput || meta?.currentDate || '',
        updatedByUid: meta?.updatedByUid || '',
        updatedByName: meta?.updatedByName || '',
      },
      categoryLabel: categoryFilter === 'all' ? 'Todas as categorias' : categoryFilter,
    });
  };

  return (
    <div className="space-y-6">
      {!canEdit && (
        <div className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100/70 dark:bg-slate-900 text-xs text-slate-600 dark:text-slate-300">
          <strong>Modo Somente Leitura (Gerente):</strong> você pode consultar as quantidades e exportar o PDF do inventário. Alterações de contagem exigem permissão de edição.
        </div>
      )}

      {/* Dates & Overview Bar */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                Inventário de Ingredientes &amp; Insumos
              </h2>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {summary.total} itens cadastrados · {summary.filled} com contagem preenchida · {summary.varied} com variação entre Base e Hoje
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleExportPdf}
              disabled={sortedItems.length === 0}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 transition-colors whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <FileText className="w-4 h-4 text-teal-700 dark:text-teal-400" />
              Exportar PDF do Inventário
            </button>

            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setFormError(null);
                  setCreateOpen(true);
                }}
                className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                Novo Item
              </button>
            )}
          </div>
        </div>

        {/* Manual Dates Bar */}
        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-4 space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              Data da Quantidade Base
            </label>
            <input
              type="date"
              disabled={!canEdit}
              value={baseDateInput}
              onChange={(e) => setBaseDateInput(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-slate-100 disabled:opacity-60 focus:border-teal-600 focus:outline-none"
            />
          </div>

          <div className="md:col-span-4 space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              Data da Quantidade Hoje
            </label>
            <input
              type="date"
              disabled={!canEdit}
              value={currentDateInput}
              onChange={(e) => setCurrentDateInput(e.target.value)}
              className="w-full px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-sm font-mono text-slate-900 dark:text-slate-100 disabled:opacity-60 focus:border-teal-600 focus:outline-none"
            />
          </div>

          <div className="md:col-span-4 flex flex-wrap items-center justify-end gap-2">
            {canEdit && (
              <button
                type="button"
                disabled={!datesChanged}
                onClick={handleSaveDates}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 disabled:opacity-45 transition-colors whitespace-nowrap"
              >
                <Save className="w-3.5 h-3.5" />
                Salvar Datas
              </button>
            )}
            {canEdit && dirtyUpdates.length > 0 && (
              <button
                type="button"
                onClick={handleSaveBatch}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white text-xs font-semibold transition-colors whitespace-nowrap"
              >
                <Save className="w-3.5 h-3.5" />
                Salvar Contagem ({dirtyUpdates.length})
              </button>
            )}
          </div>
        </div>
      </div>

      {formError && !createOpen && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
          {formError}
        </div>
      )}

      {/* Empty Seed Banner */}
      {!loading && sortedItems.length === 0 && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-10 text-center space-y-4">
          <Package className="w-8 h-8 text-teal-700 dark:text-teal-400 mx-auto" />
          <div className="space-y-1">
            <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
              Inventário pronto para iniciar
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
              Carregue com 1 clique a sua base completa do restaurante (114 ingredientes e embalagens em 10 categorias) com Quantidade Base e Quantidade Hoje zeradas para contagem.
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={handleSeedClick}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white text-xs font-semibold transition-colors"
            >
              <Sparkles className="w-4 h-4" />
              Carregar Base do Restaurante (114 itens)
            </button>
          )}
        </div>
      )}

      {/* Category & Filter Controls */}
      {sortedItems.length > 0 && (
        <>
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
              Todas ({sortedItems.length})
            </button>
            {INVENTORY_CATEGORIES.map((cat) => {
              const count = sortedItems.filter((i) => i.category === cat).length;
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
                    <th className="py-3 px-4 text-right w-36">
                      Qtd. Base
                      {baseDateInput && (
                        <span className="block font-mono text-[10px] text-slate-400">
                          {formatDateBR(baseDateInput)}
                        </span>
                      )}
                    </th>
                    <th className="py-3 px-4 text-right w-36">
                      Qtd. Hoje
                      {currentDateInput && (
                        <span className="block font-mono text-[10px] text-slate-400">
                          {formatDateBR(currentDateInput)}
                        </span>
                      )}
                    </th>
                    <th className="py-3 px-4 text-right whitespace-nowrap">Variação</th>
                    <th className="py-3 px-4 min-w-[160px]">Observação</th>
                    {canEdit && <th className="py-3 px-4 text-right">Ação</th>}
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
                          {canEdit ? (
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
                          {canEdit ? (
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
                          {canEdit ? (
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
                          {canEdit ? (
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
                        {canEdit && (
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

          {canEdit && dirtyUpdates.length > 0 && (
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

      {/* New Item Modal */}
      {createOpen && canEdit && (
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

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-4">
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
