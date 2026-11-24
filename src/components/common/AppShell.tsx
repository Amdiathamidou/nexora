import React, { useEffect, useState } from 'react';
import {
  Archive,
  BarChart3,
  Bell,
  Building2,
  CheckSquare,
  ChevronRight,
  FilePlus2,
  GitBranch,
  Inbox,
  LayoutDashboard,
  LogOut,
  Mail,
  Menu,
  Moon,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  UserCircle,
  Users,
  X,
} from 'lucide-react';
import { apiFetch } from '../../api/client.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { useTheme } from '../../context/ThemeContext.tsx';
import { NexoraLogo } from './NexoraLogo.tsx';

export type AppPage =
  | 'dashboard'
  | 'secretariat'
  | 'mails'
  | 'mail-create'
  | 'mail-detail'
  | 'workflows'
  | 'tasks'
  | 'users'
  | 'services'
  | 'notifications'
  | 'reports'
  | 'archives'
  | 'settings'
  | 'profile'
  | 'superadmin';

interface AppShellProps {
  currentPage: AppPage;
  breadcrumb: string;
  onNavigate: (page: AppPage, param?: string) => void;
  globalSearch: string;
  onGlobalSearch: (q: string) => void;
  children: React.ReactNode;
}

export function AppShell({
  currentPage,
  breadcrumb,
  onNavigate,
  globalSearch,
  onGlobalSearch,
  children,
}: AppShellProps) {
  const { user, company, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user || user.role === 'SUPER_ADMIN') return;
    apiFetch<{ unreadCount: number }>('/api/notifications')
      .then((d) => setUnreadCount(d.unreadCount))
      .catch(() => {});
  }, [user, currentPage]);

  if (!user) return null;

  const isSuperAdmin = user.role === 'SUPER_ADMIN';
  const showSecretariatNav =
    !isSuperAdmin && (user.isSecretariat || user.role === 'ADMIN');

  const navItems: Array<{ id: AppPage; label: string; Icon: typeof LayoutDashboard; show: boolean }> = [
    { id: 'superadmin', label: 'Console Plateforme', Icon: ShieldCheck, show: isSuperAdmin },
    { id: 'dashboard', label: 'Tableau de bord', Icon: LayoutDashboard, show: !isSuperAdmin },
    { id: 'secretariat', label: 'Espace Secrétariat', Icon: Inbox, show: showSecretariatNav },
    { id: 'mails', label: 'Courriers', Icon: Mail, show: !isSuperAdmin },
    { id: 'mail-create', label: 'Enregistrer / IA', Icon: FilePlus2, show: !isSuperAdmin && (user.isSecretariat || user.role === 'ADMIN' || user.role === 'RESPONSABLE') },
    { id: 'tasks', label: 'Mes tâches', Icon: CheckSquare, show: !isSuperAdmin },
    { id: 'workflows', label: 'Circuits & Workflows', Icon: GitBranch, show: !isSuperAdmin && (user.role === 'ADMIN' || user.role === 'PRESIDENT' || user.role === 'RESPONSABLE') },
    { id: 'reports', label: 'Rapports & Stats', Icon: BarChart3, show: !isSuperAdmin && (user.role === 'ADMIN' || user.role === 'PRESIDENT' || user.role === 'RESPONSABLE') },
    { id: 'archives', label: 'Archives', Icon: Archive, show: !isSuperAdmin },
    { id: 'services', label: 'Services', Icon: Building2, show: !isSuperAdmin && (user.role === 'ADMIN' || user.role === 'PRESIDENT') },
    { id: 'users', label: 'Utilisateurs', Icon: Users, show: !isSuperAdmin && user.role === 'ADMIN' },
    { id: 'notifications', label: 'Notifications & E-mails', Icon: Bell, show: !isSuperAdmin },
    { id: 'settings', label: 'Paramètres & Abonnement', Icon: Settings, show: !isSuperAdmin && user.role === 'ADMIN' },
    { id: 'profile', label: 'Mon profil & Signature', Icon: UserCircle, show: true },
  ];

  const roleLabels: Record<string, string> = {
    SUPER_ADMIN: 'Super Admin NEXORA',
    ADMIN: 'Administrateur',
    PRESIDENT: 'Président',
    RESPONSABLE: 'Responsable de service',
    AGENT: user.isSecretariat ? 'Agent Secrétariat' : 'Agent traitant',
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNavigate('mails');
  };

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-[264px] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform duration-200 lg:static lg:translate-x-0 no-print ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <NexoraLogo />
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white"
            aria-label="Fermer le menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Organization Header */}
        {!isSuperAdmin && company && (
          <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
            {company.logo_url ? (
              <img
                src={company.logo_url}
                alt={company.trade_name}
                className="w-10 h-10 rounded-lg object-contain bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-0.5 shrink-0"
              />
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">{company.trade_name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {company.city}, {company.country}
                {company.is_demo === 1 ? ' · Démo' : ''}
              </p>
              {company.status === 'trial' && (
                <p className="text-[11px] font-mono text-amber-700 dark:text-amber-400 mt-1">
                  Essai gratuit : {company.trial_days_remaining} j restants
                </p>
              )}
            </div>
          </div>
        )}

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems
            .filter((item) => item.show)
            .map((item) => {
              const Icon = item.Icon;
              const active = currentPage === item.id || (item.id === 'mails' && currentPage === 'mail-detail');
              const customBg = active
                ? { backgroundColor: company?.primary_color || 'var(--primary-color, #2563EB)', color: '#ffffff' }
                : undefined;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    onNavigate(item.id);
                    setSidebarOpen(false);
                  }}
                  style={customBg}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </span>
                  {item.id === 'notifications' && unreadCount > 0 && (
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-red-600 text-white">
                      {unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
        </nav>

        {/* User Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
          <button
            type="button"
            onClick={() => {
              onNavigate('profile');
              setSidebarOpen(false);
            }}
            className="w-full text-left p-2 -mx-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-2.5"
          >
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.fullName}
                className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
              />
            ) : (
              <UserCircle className="w-9 h-9 text-slate-500 dark:text-slate-400 shrink-0" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{user.fullName}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {roleLabels[user.role] || user.role} · Mon profil
              </p>
            </div>
          </button>
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors whitespace-nowrap"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Déconnexion</span>
          </button>
        </div>
      </aside>

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 lg:px-8 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Ouvrir le menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 truncate">
              <span className="font-medium text-slate-900 dark:text-white">NEXORA</span>
              <ChevronRight className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{breadcrumb}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {!isSuperAdmin && (
              <form onSubmit={handleSearchSubmit} className="hidden md:flex items-center relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 pointer-events-none" aria-hidden="true" />
                <input
                  type="search"
                  value={globalSearch}
                  onChange={(e) => onGlobalSearch(e.target.value)}
                  placeholder="Rechercher réf., objet, OCR..."
                  className="w-64 pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-600"
                />
              </form>
            )}

            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              aria-label={theme === 'dark' ? 'Activer le mode clair' : 'Activer le mode sombre'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {!isSuperAdmin && (
              <button
                type="button"
                onClick={() => onNavigate('notifications')}
                className="relative p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Notifications et e-mails"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-600 text-white text-[10px] font-mono flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => onNavigate('profile')}
              className="flex items-center gap-2 pl-1 pr-2.5 py-1 rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Mon profil & Signature numérique"
            >
              {user.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt={user.fullName}
                  className="w-7 h-7 rounded-full object-cover"
                />
              ) : (
                <UserCircle className="w-7 h-7 text-slate-500 dark:text-slate-400" />
              )}
              <span className="hidden sm:inline text-xs font-medium text-slate-700 dark:text-slate-200 max-w-[130px] truncate">
                {user.fullName}
              </span>
            </button>
          </div>
        </header>

        {/* Viewport Content */}
        <main className="flex-1 p-4 lg:p-8 max-w-[1440px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
