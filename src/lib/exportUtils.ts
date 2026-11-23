import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  formatCurrencyBRL,
  formatDateBR,
  formatMonthKeyBR,
  getTodayIsoDate,
  INVENTORY_PERIOD_STATUS_LABELS,
  type AuditLog,
  type InventoryItem,
  type InventoryPeriod,
  type TransitionPayment,
  type TransitionTask,
} from '../types/domain';
import { isUrgentTask } from './notifications';

const STATUS_LABEL: Record<string, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
};

const PRIORITY_LABEL: Record<string, string> = {
  baixa: 'Baixa',
  media: 'Média',
  alta: 'Alta',
  urgente: 'Urgente',
};

export function exportToExcel(params: {
  tasks: TransitionTask[];
  payments: TransitionPayment[];
  auditLogs?: AuditLog[];
  monthLabel: string;
}) {
  const { tasks, payments, auditLogs, monthLabel } = params;

  const totalSpent = payments.reduce((acc, p) => acc + p.amount, 0);
  const payerTotals = new Map<string, number>();
  for (const p of payments) {
    payerTotals.set(p.paidBy, (payerTotals.get(p.paidBy) || 0) + p.amount);
  }

  const completedTasks = tasks.filter((t) => t.status === 'concluido').length;
  const urgentTasks = tasks.filter((t) => isUrgentTask(t)).length;
  const completionPct = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;

  const summaryRows = [
    { Indicador: 'Empresa', Valor: 'Creps Urca' },
    { Indicador: 'Período do Relatório', Valor: monthLabel },
    { Indicador: 'Data de Exportação', Valor: formatDateBR(getTodayIsoDate()) },
    { Indicador: 'Total de Pagamentos Lançados', Valor: payments.length },
    { Indicador: 'Total Gasto (BRL)', Valor: totalSpent },
    ...Array.from(payerTotals.entries()).map(([payer, val]) => ({
      Indicador: `Desembolso ${payer} (BRL)`,
      Valor: val,
    })),
    { Indicador: 'Atividades Totais', Valor: tasks.length },
    { Indicador: 'Atividades Concluídas', Valor: completedTasks },
    { Indicador: 'Progresso da Transição (%)', Valor: `${completionPct}%` },
    { Indicador: 'Atividades Urgentes / Atrasadas', Valor: urgentTasks },
  ];

  const taskRows = tasks.map((t) => ({
    Atividade: t.title,
    Categoria: t.category,
    Responsável: t.assigneeName,
    'Data Limite': formatDateBR(t.dueDate),
    Prioridade: PRIORITY_LABEL[t.priority] || t.priority,
    Status: STATUS_LABEL[t.status] || t.status,
    Descrição: t.description,
    'Criado Por': t.createdByName,
  }));

  const paymentRows = payments.map((p) => ({
    Data: formatDateBR(p.paymentDate),
    Descrição: p.description,
    'Pago Por': p.paidBy,
    Categoria: p.category,
    'Forma de Pagamento': p.paymentMethod,
    Status: p.status === 'pago' ? 'Pago' : 'Agendado',
    'Valor (R$)': p.amount,
    Comprovante: p.receiptRef || '—',
    Observações: p.notes || '—',
  }));

  const wb = XLSX.utils.book_new();
  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
  const wsTasks = XLSX.utils.json_to_sheet(
    taskRows.length > 0 ? taskRows : [{ Aviso: 'Nenhuma atividade registrada no período' }]
  );
  const wsPayments = XLSX.utils.json_to_sheet(
    paymentRows.length > 0 ? paymentRows : [{ Aviso: 'Nenhum pagamento registrado no período' }]
  );

  XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo Executivo');
  XLSX.utils.book_append_sheet(wb, wsTasks, 'Checklist Transição');
  XLSX.utils.book_append_sheet(wb, wsPayments, 'Pagamentos');

  if (auditLogs && auditLogs.length > 0) {
    const auditRows = auditLogs.map((log) => ({
      Entidade: log.entityType,
      Ação: log.action,
      Resumo: log.summary,
      Autor: `${log.actorName} (${log.actorEmail})`,
      Valor: log.amount,
      Origem: log.source,
    }));
    const wsAudit = XLSX.utils.json_to_sheet(auditRows);
    XLSX.utils.book_append_sheet(wb, wsAudit, 'Auditoria');
  }

  XLSX.writeFile(wb, `Creps_Urca_Relatorio_${getTodayIsoDate()}.xlsx`);
}

async function svgElementToPngDataUrl(container: HTMLElement | null): Promise<{
  dataUrl: string;
  width: number;
  height: number;
} | null> {
  if (!container) return null;
  const svg = container.querySelector('svg');
  if (!svg) return null;

  const rect = svg.getBoundingClientRect();
  const width = Math.max(rect.width, 600);
  const height = Math.max(rect.height, 260);

  const cloned = svg.cloneNode(true) as SVGElement;
  cloned.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  cloned.setAttribute('width', String(width));
  cloned.setAttribute('height', String(height));

  const serializer = new XMLSerializer();
  const svgStr = serializer.serializeToString(cloned);
  const blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });

    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0, width, height);
    return {
      dataUrl: canvas.toDataURL('image/png'),
      width,
      height,
    };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function exportMonthlyPdf(params: {
  tasks: TransitionTask[];
  payments: TransitionPayment[];
  monthLabel: string;
  chartContainer?: HTMLElement | null;
}) {
  const { tasks, payments, monthLabel, chartContainer } = params;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const totalSpent = payments.reduce((acc, p) => acc + p.amount, 0);
  const payerMap = new Map<string, number>();
  for (const p of payments) {
    payerMap.set(p.paidBy, (payerMap.get(p.paidBy) || 0) + p.amount);
  }

  const completedTasks = tasks.filter((t) => t.status === 'concluido').length;
  const progressPct = tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0;

  // Institutional Header
  pdf.setFillColor(15, 118, 110);
  pdf.rect(0, 0, 210, 28, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(17);
  pdf.text('CREPS URCA — Relatório de Transição & Finanças', 14, 13);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  pdf.text(`Período: ${monthLabel}  ·  Gerado em ${formatDateBR(getTodayIsoDate())}`, 14, 21);

  // Executive KPI Summary Table
  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text('1. Resumo Executivo da Transição', 14, 38);

  const summaryBody: Array<[string, string]> = [
    ['Total Investido / Pago até Aqui', formatCurrencyBRL(totalSpent)],
    ...Array.from(payerMap.entries()).map(([payer, val]): [string, string] => [
      `Desembolso · ${payer}`,
      formatCurrencyBRL(val),
    ]),
    ['Progresso do Checklist de Transição', `${completedTasks} de ${tasks.length} atividades (${progressPct}%)`],
  ];

  autoTable(pdf, {
    startY: 42,
    head: [['Indicador', 'Consolidado']],
    body: summaryBody,
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: [30, 41, 59] },
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
  });

  let nextY = (pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 90;

  // Embed captured chart image if available
  const chartImage = await svgElementToPngDataUrl(chartContainer ?? null);
  if (chartImage) {
    nextY += 8;
    if (nextY > 215) {
      pdf.addPage();
      nextY = 18;
    }
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.text('2. Análise Gráfica de Despesas', 14, nextY);
    const maxW = 182;
    const imgH = Math.min(72, (chartImage.height / chartImage.width) * maxW);
    pdf.addImage(chartImage.dataUrl, 'PNG', 14, nextY + 4, maxW, imgH);
    nextY += imgH + 12;
  }

  // Payments Table
  if (nextY > 230) {
    pdf.addPage();
    nextY = 18;
  } else {
    nextY += 6;
  }
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text(chartImage ? '3. Pagamentos Realizados no Período' : '2. Pagamentos Realizados no Período', 14, nextY);

  autoTable(pdf, {
    startY: nextY + 4,
    head: [['Data', 'Descrição', 'Pago Por', 'Categoria', 'Status', 'Valor']],
    body:
      payments.length > 0
        ? payments.map((p) => [
            formatDateBR(p.paymentDate),
            p.description,
            p.paidBy,
            p.category,
            p.status === 'pago' ? 'Pago' : 'Agendado',
            formatCurrencyBRL(p.amount),
          ])
        : [['—', 'Nenhum pagamento lançado neste período', '—', '—', '—', 'R$ 0,00']],
    theme: 'striped',
    headStyles: { fillColor: [15, 118, 110], textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59] },
    columnStyles: { 5: { halign: 'right', fontStyle: 'bold' } },
  });

  nextY = ((pdf as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? nextY + 30) + 10;
  if (nextY > 230) {
    pdf.addPage();
    nextY = 18;
  }

  // Tasks Table
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(12);
  pdf.text(chartImage ? '4. Checklist de Atividades de Transição' : '3. Checklist de Atividades de Transição', 14, nextY);

  autoTable(pdf, {
    startY: nextY + 4,
    head: [['Atividade', 'Responsável', 'Categoria', 'Prazo', 'Status']],
    body:
      tasks.length > 0
        ? tasks.map((t) => [
            t.title,
            t.assigneeName,
            t.category,
            formatDateBR(t.dueDate),
            STATUS_LABEL[t.status] || t.status,
          ])
        : [['Nenhuma atividade registrada', '—', '—', '—', '—']],
    theme: 'striped',
    headStyles: { fillColor: [30, 41, 59], textColor: 255, fontSize: 8.5 },
    bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59] },
  });

  pdf.save(`Creps_Urca_Relatorio_Mensal_${getTodayIsoDate()}.pdf`);
}

export function exportInventoryPdf(params: {
  items: InventoryItem[];
  period: InventoryPeriod;
  selectedCategoriesLabel: string;
}) {
  const { items, period, selectedCategoriesLabel } = params;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const monthLabel = formatMonthKeyBR(period.monthKey);
  const baseDateLabel = period.baseDate ? formatDateBR(period.baseDate) : 'Não informada';
  const currentDateLabel = period.currentDate ? formatDateBR(period.currentDate) : 'Não informada';
  const baseTag = period.baseValidated ? 'Validada' : 'Pendente';
  const currentTag = period.currentValidated ? 'Validada' : 'Pendente';
  const statusLabel =
    period.status === 'aprovado' && period.reviewedByName
      ? `Aprovado por ${period.reviewedByName}`
      : INVENTORY_PERIOD_STATUS_LABELS[period.status];

  pdf.setFillColor(15, 118, 110);
  pdf.rect(0, 0, 210, 34, 'F');
  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15.5);
  pdf.text(`CREPS URCA — Inventário de Estoque (${monthLabel})`, 14, 12);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text(
    `Qtd. Base: ${baseDateLabel} (${baseTag})   ·   Qtd. Hoje: ${currentDateLabel} (${currentTag})`,
    14,
    20
  );
  pdf.text(
    `Status: ${statusLabel}   ·   Categorias: ${selectedCategoriesLabel}`,
    14,
    27
  );

  const countedCount = items.filter((i) => i.baseQty > 0 || i.currentQty > 0).length;
  const changedCount = items.filter((i) => i.baseQty !== i.currentQty).length;

  pdf.setTextColor(15, 23, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text(
    `Resumo: ${items.length} itens exportados  ·  ${countedCount} com contagem preenchida  ·  ${changedCount} com variação`,
    14,
    42
  );

  const fmtQty = (n: number) =>
    new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 }).format(n);

  autoTable(pdf, {
    startY: 47,
    head: [
      [
        'Categoria',
        'Ingrediente / Item',
        'Unid.',
        `Qtd. Base\n(${baseDateLabel})`,
        `Qtd. Hoje\n(${currentDateLabel})`,
        'Variação',
        'Observação',
      ],
    ],
    body:
      items.length > 0
        ? items.map((item) => {
            const diff = Math.round((item.currentQty - item.baseQty) * 1000) / 1000;
            const diffStr = diff > 0 ? `+${fmtQty(diff)}` : fmtQty(diff);
            return [
              item.category,
              item.name,
              item.unit,
              fmtQty(item.baseQty),
              fmtQty(item.currentQty),
              diffStr,
              item.notes || '—',
            ];
          })
        : [['—', 'Nenhum item nas categorias selecionadas', '—', '0', '0', '0', '—']],
    theme: 'striped',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8 },
    bodyStyles: { fontSize: 7.8, textColor: [30, 41, 59] },
    columnStyles: {
      2: { halign: 'center' },
      3: { halign: 'right', fontStyle: 'bold' },
      4: { halign: 'right', fontStyle: 'bold' },
      5: { halign: 'right' },
    },
  });

  pdf.save(`Creps_Urca_Inventario_${period.monthKey}_${getTodayIsoDate()}.pdf`);
}
