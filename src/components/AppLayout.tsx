import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from '@/components/AppSidebar';
import { useAuth } from '@/hooks/useAuth';
import { Search, Bell } from 'lucide-react';
import { useLocation } from 'react-router-dom';

interface Props {
  children: React.ReactNode;
}

export default function AppLayout({ children }: Props) {
  const { profile } = useAuth();
  const location = useLocation();

  // Auto-collapse sidebar on forms list page
  const defaultOpen = location.pathname !== '/';

  const initials = (profile?.display_name || profile?.email || 'U')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          {/* Product header */}
          <header className="h-14 flex items-center border-b border-border px-4 bg-background gap-4">
            <SidebarTrigger className="mr-1" />

            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar..."
                className="w-full h-9 pl-9 pr-3 rounded-full border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/30 transition-all"
              />
            </div>

            <div className="flex-1" />

            {/* Right side */}
            <div className="flex items-center gap-3">
              <button className="relative h-9 w-9 rounded-full flex items-center justify-center hover:bg-[hsl(var(--paper-300))] transition-colors">
                <Bell className="h-4 w-4 text-muted-foreground" />
              </button>
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-[hsl(var(--paper-300))] flex items-center justify-center text-xs font-semibold text-[hsl(var(--paper-950))]">
                  {initials}
                </div>
                <span className="text-sm font-medium text-foreground hidden sm:inline">
                  {profile?.display_name?.split(' ')[0] || 'Usuário'}
                </span>
              </div>
            </div>
          </header>
          <main className="flex-1 bg-background overflow-auto">
            {children}
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
