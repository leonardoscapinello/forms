import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Settings, LogOut, LayoutDashboard, Image } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sidebar, SidebarContent, SidebarFooter, useSidebar } from '@/components/ui/sidebar';

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
  const { state } = useSidebar();
  const collapsed = state === 'collapsed';

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

  const renderNavItem = (item: typeof mainItems[0], section: 'main' | 'system' = 'main') => {
    const active = isActive(item.url);

    return (
      <button
        key={item.title}
        type="button"
        onClick={() => navigate(item.url)}
        aria-current={active ? 'page' : undefined}
        title={collapsed ? item.title : undefined}
        style={
          active
            ? {
                background:
                  'linear-gradient(90deg, hsl(var(--sidebar-primary)) 0%, hsl(var(--sidebar-primary) / 0.92) 100%)',
              }
            : undefined
        }
        className={cn(
          'group/item flex h-10 w-full items-center gap-3 rounded-lg px-4 text-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
          'group-data-[collapsible=icon]:h-9 group-data-[collapsible=icon]:w-9 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:rounded-lg group-data-[collapsible=icon]:px-0',
          !collapsed && section === 'main' && '-mr-4 rounded-r-none',
          active
            ? 'text-sidebar-primary-foreground font-semibold shadow-sm'
            : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        )}
      >
        <item.icon
          className={cn(
            'h-[18px] w-[18px] shrink-0 transition-colors',
            active ? 'text-sidebar-primary-foreground' : 'text-sidebar-foreground/55',
          )}
        />
        <span className="truncate group-data-[collapsible=icon]:hidden">{item.title}</span>
      </button>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border bg-sidebar">
      <SidebarContent className="gap-0">
        <div className="px-5 pt-5 pb-4 border-b border-sidebar-border">
          <img
            src="/images/twobrain-logo-dark.svg"
            alt="twobrain"
            className="h-6 w-auto max-w-[127px] group-data-[collapsible=icon]:mx-auto group-data-[collapsible=icon]:h-5"
          />
        </div>

        <section className="p-4 group-data-[collapsible=icon]:p-2">
          <nav className="flex flex-col gap-1.5">{mainItems.map((item) => renderNavItem(item, 'main'))}</nav>
        </section>

        <section className="p-4 group-data-[collapsible=icon]:p-2">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-sidebar-foreground/50 group-data-[collapsible=icon]:hidden">
            Sistema
          </p>
          <nav className="flex flex-col gap-1">{systemItems.map((item) => renderNavItem(item, 'system'))}</nav>
        </section>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border p-4 group-data-[collapsible=icon]:p-2">
        <div className="mb-3 flex items-center gap-3 group-data-[collapsible=icon]:mb-2 group-data-[collapsible=icon]:justify-center">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
            {initials}
          </div>
          <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
            <p className="truncate text-sm font-medium text-sidebar-foreground">{profile?.display_name || 'Usuário'}</p>
            <p className="truncate text-xs text-sidebar-foreground/60">{profile?.email || ''}</p>
          </div>
        </div>

        <div className={cn('flex items-center gap-2', collapsed && 'justify-center')}>
          {role === 'admin' && (
            <button
              type="button"
              onClick={() => navigate('/settings')}
              title={collapsed ? 'Admin' : undefined}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                collapsed && 'w-8 justify-center px-0',
              )}
            >
              <Settings className="h-3.5 w-3.5" />
              <span className={cn(collapsed && 'hidden')}>Admin</span>
            </button>
          )}

          <button
            type="button"
            onClick={signOut}
            title={collapsed ? 'Sair' : undefined}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              role === 'admin' && !collapsed && 'ml-auto',
              collapsed && 'w-8 justify-center px-0',
            )}
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className={cn(collapsed && 'hidden')}>Sair</span>
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}



