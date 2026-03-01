import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Settings, LogOut, LayoutDashboard, Image } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sidebar, SidebarContent, SidebarFooter } from '@/components/ui/sidebar';

const mainItems = [
  { title: 'Dashboard', url: '/', icon: LayoutDashboard },
  { title: 'Galeria', url: '/gallery', icon: Image },
];

const systemItems = [
  { title: 'Configurações', url: '/settings', icon: Settings },
];

export function AppSidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, signOut, role } = useAuth();

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  const initials = (profile?.display_name || profile?.email || 'U')
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const renderNavItem = (item: typeof mainItems[0]) => {
    const active = isActive(item.url);

    return (
      <button
        key={item.title}
        type="button"
        onClick={() => navigate(item.url)}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'flex h-10 w-full items-center gap-3 rounded-lg px-4 text-sm transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
          active
            ? 'bg-sidebar-primary text-sidebar-primary-foreground font-semibold'
            : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        )}
      >
        <item.icon
          className={cn(
            'h-[18px] w-[18px] shrink-0',
            active ? 'text-sidebar-primary-foreground' : 'text-sidebar-foreground/60',
          )}
        />
        <span className="truncate">{item.title}</span>
      </button>
    );
  };

  return (
    <Sidebar className="border-r border-sidebar-border bg-sidebar">
      <SidebarContent className="gap-0">
        <div className="p-4">
          <img
            src="/images/twobrain-logo-dark.svg"
            alt="twobrain"
            className="h-6 w-auto max-w-[127px]"
          />
        </div>

        <section className="p-4">
          <nav className="flex flex-col gap-1">{mainItems.map(renderNavItem)}</nav>
        </section>

        <section className="p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-sidebar-foreground/60">
            Sistema
          </p>
          <nav className="flex flex-col gap-1">{systemItems.map(renderNavItem)}</nav>
        </section>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-sidebar-foreground">
              {profile?.display_name || 'Usuário'}
            </p>
            <p className="truncate text-xs text-sidebar-foreground/60">
              {profile?.email || ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {role === 'admin' && (
            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <Settings className="h-3.5 w-3.5" />
              <span>Admin</span>
            </button>
          )}

          <button
            type="button"
            onClick={signOut}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              role === 'admin' && 'ml-auto',
            )}
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sair</span>
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}

