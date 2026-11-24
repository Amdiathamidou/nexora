import { useEffect, useRef, useState } from 'react';
import { AppShell, type AppPage } from './components/common/AppShell.tsx';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { ThemeProvider } from './context/ThemeContext.tsx';
import { AuthPages } from './pages/AuthPages.tsx';
import { MailCreateAIPage } from './pages/MailCreateAIPage.tsx';
import { MailDetailPage } from './pages/MailDetailPage.tsx';
import { MailListPage } from './pages/MailListPage.tsx';
import { NotificationsAndEmailsPage } from './pages/NotificationsAndEmailsPage.tsx';
import { ServicesPage, UsersPage } from './pages/OrganizationPages.tsx';
import { ProfilePage } from './pages/ProfilePage.tsx';
import { PublicSite } from './pages/PublicSite.tsx';
import { ArchivesPage, ReportsPage } from './pages/ReportsAndArchivesPage.tsx';
import { RoleDashboardPage } from './pages/RoleDashboards.tsx';
import { SettingsAndBillingPage, SuperAdminPage } from './pages/SettingsAndSuperAdminPages.tsx';
import { TasksPage, WorkflowsPage } from './pages/WorkflowsAndTasksPages.tsx';

function NexoraRouter() {
  const { user, company, loading } = useAuth();
  const { applyBrandColor } = useTheme();
  const [publicMode, setPublicMode] = useState<'site' | 'login' | 'register'>('site');
  const [currentPage, setCurrentPage] = useState<AppPage>('dashboard');
  const [selectedMailId, setSelectedMailId] = useState<string>('');
  const [globalSearch, setGlobalSearch] = useState('');
  const lastUserIdRef = useRef<string | null>(null);

  // Application automatique de la couleur personnalisée de l'entreprise
  useEffect(() => {
    if (company?.primary_color) {
      applyBrandColor(company.primary_color);
    }
  }, [company?.primary_color, applyBrandColor]);

  useEffect(() => {
    const nextUserId = user?.id ?? null;
    if (nextUserId === lastUserIdRef.current) {
      return;
    }
    lastUserIdRef.current = nextUserId;
    if (user) {
      if (user.role === 'SUPER_ADMIN') {
        setCurrentPage('superadmin');
      } else if (user.isSecretariat && user.role === 'AGENT') {
        setCurrentPage('secretariat');
      } else {
        setCurrentPage('dashboard');
      }
    } else {
      setPublicMode('site');
    }
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-sm text-slate-500">
        Chargement de NEXORA...
      </div>
    );
  }

  // Si l'URL contient un lien d'activation (?action=activate&token=...), afficher directement la page d'activation
  const urlParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const isActivationFlow = urlParams?.get('action') === 'activate' && Boolean(urlParams?.get('token'));

  if (isActivationFlow) {
    return <AuthPages initialMode="activate" onBackPublic={() => (window.location.href = '/')} />;
  }

  if (!user) {
    if (publicMode === 'login') {
      return <AuthPages initialMode="login" onBackPublic={() => setPublicMode('site')} />;
    }
    if (publicMode === 'register') {
      return <AuthPages initialMode="register" onBackPublic={() => setPublicMode('site')} />;
    }
    return (
      <PublicSite
        onGoLogin={() => setPublicMode('login')}
        onGoRegister={() => setPublicMode('register')}
      />
    );
  }

  const handleNavigate = (page: AppPage, param?: string) => {
    if (page === 'mail-detail' && param) {
      setSelectedMailId(param);
    }
    setCurrentPage(page);
  };

  const breadcrumbs: Record<AppPage, string> = {
    dashboard: 'Tableau de bord',
    secretariat: 'Espace Secrétariat',
    mails: 'Courriers',
    'mail-create': 'Enregistrement & Analyse IA',
    'mail-detail': 'Fiche détaillée du courrier',
    workflows: 'Circuits administratifs',
    tasks: 'Moteur de tâches',
    users: 'Utilisateurs & Permissions',
    services: 'Services & Départements',
    notifications: 'Notifications & E-mails',
    reports: 'Rapports & Statistiques',
    archives: 'Archives',
    settings: 'Paramètres & Abonnement',
    profile: 'Mon profil & Signature numérique',
    superadmin: 'Console Super Admin',
  };

  return (
    <AppShell
      currentPage={currentPage}
      breadcrumb={breadcrumbs[currentPage]}
      onNavigate={handleNavigate}
      globalSearch={globalSearch}
      onGlobalSearch={setGlobalSearch}
    >
      {currentPage === 'superadmin' && <SuperAdminPage />}
      {currentPage === 'dashboard' && <RoleDashboardPage mode="role" onNavigate={handleNavigate} />}
      {currentPage === 'secretariat' && <RoleDashboardPage mode="secretariat" onNavigate={handleNavigate} />}
      {currentPage === 'mails' && <MailListPage globalSearch={globalSearch} onNavigate={handleNavigate} />}
      {currentPage === 'mail-create' && <MailCreateAIPage onNavigate={handleNavigate} />}
      {currentPage === 'mail-detail' && selectedMailId && (
        <MailDetailPage mailId={selectedMailId} onNavigate={handleNavigate} />
      )}
      {currentPage === 'workflows' && <WorkflowsPage />}
      {currentPage === 'tasks' && <TasksPage onNavigate={handleNavigate} />}
      {currentPage === 'users' && <UsersPage />}
      {currentPage === 'services' && <ServicesPage />}
      {currentPage === 'notifications' && <NotificationsAndEmailsPage onNavigate={handleNavigate} />}
      {currentPage === 'reports' && <ReportsPage />}
      {currentPage === 'archives' && <ArchivesPage onNavigate={handleNavigate} />}
      {currentPage === 'settings' && <SettingsAndBillingPage />}
      {currentPage === 'profile' && <ProfilePage />}
    </AppShell>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <NexoraRouter />
      </AuthProvider>
    </ThemeProvider>
  );
}
