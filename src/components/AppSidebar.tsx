import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Settings, LogOut, LayoutDashboard, Image } from 'lucide-react';
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
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const NavItem = ({ item }: { item: typeof mainItems[0] }) => {
    const active = isActive(item.url);
    return (
      <button
        onClick={() => navigate(item.url)}
        className={`w-full flex items-center gap-3 h-10 px-4 rounded-lg text-[14px] transition-colors ${
          active
            ? 'bg-[#203300] text-white font-medium'
            : 'text-[#474738] hover:bg-[#F1F1E9]'
        }`}
      >
        <item.icon
          className={`h-[18px] w-[18px] flex-shrink-0 ${
            active ? 'text-white' : 'text-[#B7B790]'
          }`}
        />
        <span>{item.title}</span>
      </button>
    );
  };

  return (
    <Sidebar className="border-r border-[#F1F1E9]">
      {/* Logo — 16px padding all around */}
      <div className="p-4 pb-2">
        <img
          src="/images/twobrain-logo-dark.svg"
          alt="twobrain"
          className="max-w-[127px]"
        />
      </div>

      <SidebarContent className="!gap-0 !p-0">
        {/* Main nav */}
        <nav className="flex flex-col gap-1 p-4 pt-2">
          {mainItems.map(item => (
            <NavItem key={item.title} item={item} />
          ))}
        </nav>

        {/* System section */}
        <div className="px-4 pt-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#B7B790] mb-2 px-0">
            Sistema
          </p>
          <nav className="flex flex-col gap-1">
            {systemItems.map(item => (
              <NavItem key={item.title} item={item} />
            ))}
          </nav>
        </div>
      </SidebarContent>

      <SidebarFooter className="!p-4 border-t border-[#F1F1E9]">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-8 w-8 rounded-full bg-[#F1F1E9] flex items-center justify-center text-[12px] font-semibold text-[#474738]">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-[#474738] truncate">
              {profile?.display_name || 'Usuário'}
            </p>
            <p className="text-[11px] text-[#B7B790] truncate">
              {profile?.email || ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {role === 'admin' && (
            <button
              onClick={() => navigate('/settings')}
              className="flex items-center gap-1.5 text-[12px] text-[#B7B790] hover:text-[#474738] transition-colors"
            >
              <Settings className="h-3.5 w-3.5" />
              <span>Admin</span>
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 text-[12px] text-[#B7B790] hover:text-[#474738] transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sair</span>
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
