import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Moon,
  ShieldCheck,
  Sun,
  User,
} from 'lucide-react';
import { auth } from '../lib/firebase';
import { BOOTSTRAPPED_ADMIN_EMAIL } from '../types/domain';
import firebaseConfig from '../../firebase-applet-config.json';

interface LoginViewProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  accessDeniedMessage?: string | null;
}

type AuthMode = 'login' | 'activate';

export const LoginView: React.FC<LoginViewProps> = ({
  theme,
  onToggleTheme,
  accessDeniedMessage,
}) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [displayName, setDisplayName] = useState('Tiago Rodrigues');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);
  const [showProviderHelp, setShowProviderHelp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setShowProviderHelp(false);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail || !password) {
      setError('Informe seu e-mail e senha de acesso.');
      return;
    }

    if (mode === 'activate') {
      if (cleanEmail !== BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()) {
        setError(
          `A ativação inicial é restrita ao e-mail ${BOOTSTRAPPED_ADMIN_EMAIL}. Demais contas devem ser criadas dentro do painel.`
        );
        return;
      }
      if (password.length < 6) {
        setError('A senha deve ter pelo menos 6 caracteres.');
        return;
      }
      setLoading(true);
      try {
        const cred = await createUserWithEmailAndPassword(auth, cleanEmail, password);
        await updateProfile(cred.user, {
          displayName: displayName.trim() || 'Tiago Rodrigues',
        });
        await sendEmailVerification(cred.user);
      } catch (err: unknown) {
        const code = (err as { code?: string })?.code || '';
        if (code === 'auth/operation-not-allowed') {
          setShowProviderHelp(true);
          setError(
            'O login por E-mail e Senha ainda precisa ser ativado no Firebase Console deste projeto.'
          );
        } else if (code === 'auth/email-already-in-use') {
          setMode('login');
          setError('Esta conta Master já foi ativada. Utilize a opção "Entrar" com sua senha.');
        } else if (code === 'auth/weak-password') {
          setError('Senha muito fraca. Utilize pelo menos 6 caracteres.');
        } else {
          setError('Não foi possível ativar a conta Master. Tente novamente.');
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, cleanEmail, password);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code || '';
      if (code === 'auth/operation-not-allowed') {
        setShowProviderHelp(true);
        setError(
          'O login por E-mail e Senha ainda precisa ser ativado no Firebase Console deste projeto.'
        );
      } else if (
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found'
      ) {
        setError(
          'E-mail ou senha incorretos, ou a conta Master ainda não foi ativada no primeiro acesso.'
        );
      } else if (code === 'auth/too-many-requests') {
        setError('Muitas tentativas seguidas. Aguarde alguns instantes e tente novamente.');
      } else {
        setError('Não foi possível entrar. Verifique suas credenciais e conexão.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setError(null);
    setInfoMessage(null);
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Digite seu e-mail acima para receber o link de redefinição de senha.');
      return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, cleanEmail);
      setInfoMessage(`Enviamos um e-mail de redefinição de senha para ${cleanEmail}.`);
    } catch {
      setError('Não foi possível enviar o e-mail de redefinição. Verifique o endereço digitado.');
    } finally {
      setLoading(false);
    }
  };

  const displayError = error || accessDeniedMessage;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      <header className="flex items-center justify-between gap-8 px-6 lg:px-10 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <span className="font-display text-lg font-bold tracking-tight whitespace-nowrap shrink-0">
          Creps Urca
        </span>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onToggleTheme}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            aria-label="Alternar tema claro ou escuro"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            <span>{theme === 'dark' ? 'Tema Claro' : 'Tema Escuro'}</span>
          </button>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 items-stretch">
        <section className="lg:col-span-6 flex items-center justify-center p-6 sm:p-10 lg:p-16">
          <div className="w-full max-w-md space-y-7">
            <div className="space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-medium text-teal-700 dark:text-teal-400">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Acesso Restrito</span>
                <span aria-hidden="true">·</span>
                <span>Administração &amp; Finanças</span>
              </div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50 [text-wrap:balance]">
                {mode === 'login'
                  ? 'Entrar no painel da Creps Urca'
                  : 'Ativar conta principal do administrador'}
              </h1>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {mode === 'login'
                  ? 'Acesse com o e-mail e a senha cadastrados para acompanhar a transição e os pagamentos da loja.'
                  : 'Use esta etapa uma única vez para registrar sua senha inicial de acesso com o e-mail principal.'}
              </p>
            </div>

            {displayError && (
              <div className="p-4 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-sm text-red-800 dark:text-red-200 space-y-2">
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600 dark:text-red-400" />
                  <span>{displayError}</span>
                </div>
                {showProviderHelp && (
                  <p className="text-xs text-red-700 dark:text-red-300 leading-relaxed pl-6">
                    Ative o provedor em{' '}
                    <a
                      href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/providers`}
                      target="_blank"
                      rel="noreferrer"
                      className="underline font-semibold"
                    >
                      Firebase Console &rarr; Authentication &rarr; Sign-in method
                    </a>{' '}
                    marcando <strong>E-mail/senha</strong> e tente novamente.
                  </p>
                )}
              </div>
            )}

            {infoMessage && (
              <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-sm text-emerald-800 dark:text-emerald-200 flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600 dark:text-emerald-400" />
                <span>{infoMessage}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'activate' && (
                <div className="space-y-1.5">
                  <label
                    htmlFor="login-name"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Nome de exibição
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="login-name"
                      type="text"
                      required
                      maxLength={80}
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Seu nome"
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <label
                  htmlFor="login-email"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  E-mail
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seuemail@exemplo.com"
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                  >
                    Senha
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => void handleResetPassword()}
                      className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline"
                    >
                      Esqueci a senha
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-11 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 rounded-lg bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
              >
                {loading
                  ? 'Processando...'
                  : mode === 'login'
                  ? 'Entrar'
                  : 'Ativar Acesso Principal'}
              </button>
            </form>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>
                {mode === 'login'
                  ? 'Primeiro acesso ainda não ativado?'
                  : 'Já ativou sua conta?'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setInfoMessage(null);
                  setShowProviderHelp(false);
                  if (mode === 'login') {
                    setEmail(BOOTSTRAPPED_ADMIN_EMAIL);
                    setMode('activate');
                  } else {
                    setMode('login');
                  }
                }}
                className="font-semibold text-teal-700 dark:text-teal-400 hover:underline whitespace-nowrap"
              >
                {mode === 'login' ? 'Ativar primeiro acesso' : 'Voltar para login'}
              </button>
            </div>
          </div>
        </section>

        <section className="hidden lg:block lg:col-span-6 relative bg-slate-200 dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 overflow-hidden">
          <img
            src="/src/assets/images/creps_urca_storefront_1795444775097.jpg"
            alt="Interior da loja Creps Urca no Rio de Janeiro"
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/35 to-transparent flex flex-col justify-end p-12 text-white">
            <p className="text-xs font-medium text-teal-300 mb-2">
              Urca, Rio de Janeiro · Nova Operação
            </p>
            <h2 className="font-display text-2xl font-bold leading-snug max-w-md [text-wrap:balance]">
              Transição organizada, pagamentos rastreados e operação pronta para abrir.
            </h2>
            <p className="text-sm text-slate-200 mt-2 max-w-md leading-relaxed">
              Sincronização em tempo real com suporte offline para acompanhar exames, sistemas PDV, bancos, inventário e despesas pré-operacionais.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
};
