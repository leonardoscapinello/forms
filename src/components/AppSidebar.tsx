import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import {
  Settings, LogOut, LayoutDashboard, Image,
} from 'lucide-react';
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarFooter,
} from '@/components/ui/sidebar';

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

  const renderItem = (item: typeof mainItems[0]) => {
    const active = isActive(item.url);
    return (
      <SidebarMenuItem key={item.title}>
        <SidebarMenuButton
          onClick={() => navigate(item.url)}
          className={`mx-2 px-4 h-10 rounded-lg text-[14px] leading-none transition-all ${
            active
              ? 'bg-sidebar-primary text-white font-medium'
              : 'bg-transparent text-sidebar-foreground hover:bg-sidebar-accent'
          }`}
        >
          <item.icon className={`h-[18px] w-[18px] mr-3 flex-shrink-0 ${active ? 'text-white' : 'text-[hsl(var(--sidebar-icon))]'}`} />
          <span>{item.title}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  const initials = (profile?.display_name || profile?.email || 'U')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <Sidebar className="border-r border-sidebar-border">
      {/* Logo */}
      <div className="px-5 pt-6 pb-5">
        <img src="/images/twobrain-logo-dark.svg" alt="twobrain" className="max-w-[127px]" />
      </div>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {mainItems.map(renderItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[hsl(var(--sidebar-icon))] px-5 mb-1">
            Sistema
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {systemItems.map(renderItem)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border px-4 py-4">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-8 w-8 rounded-full bg-sidebar-accent flex items-center justify-center text-xs font-semibold text-sidebar-foreground">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-sidebar-foreground truncate">
              {profile?.display_name || 'Usuário'}
            </p>
            <p className="text-[11px] text-[hsl(var(--sidebar-icon))] truncate">
              {profile?.email || ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-1">
          {role === 'admin' && (
            <button
              onClick={() => navigate('/settings')}
              className="flex items-center gap-1.5 text-[12px] text-[hsl(var(--sidebar-icon))] hover:text-sidebar-foreground transition-colors"
            >
              <Settings className="h-3.5 w-3.5" />
              <span>Admin</span>
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 text-[12px] text-[hsl(var(--sidebar-icon))] hover:text-sidebar-foreground transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sair</span>
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
