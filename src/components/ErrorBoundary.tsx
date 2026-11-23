import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
  isPermissionError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      message: '',
      isPermissionError: false,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    let message = error.message || 'Erro inesperado na aplicação.';
    let isPermissionError = false;
    try {
      const parsed = JSON.parse(message) as { error?: string; operationType?: string; path?: string };
      if (parsed && parsed.error) {
        isPermissionError = parsed.error.toLowerCase().includes('permission');
        message = `${parsed.error}${parsed.path ? ` (${parsed.operationType}: ${parsed.path})` : ''}`;
      }
    } catch {
      // Plain error message
    }
    return {
      hasError: true,
      message,
      isPermissionError,
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h2 className="text-lg font-semibold">
                {this.state.isPermissionError
                  ? 'Permissão Negada pelo Servidor'
                  : 'Ocorreu um erro na interface'}
              </h2>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
              {this.state.isPermissionError
                ? 'Sua conta não possui autorização para executar esta operação nas regras de segurança do Firestore.'
                : 'Não foi possível concluir a operação solicitada.'}
            </p>
            <div className="p-3 rounded-lg bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 font-mono text-xs text-slate-700 dark:text-slate-300 break-words">
              {this.state.message}
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-sm font-medium transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Recarregar Painel
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
