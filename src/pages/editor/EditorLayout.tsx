import { Suspense, lazy } from 'react';
import { Outlet, useNavigate, useLocation, useParams } from 'react-router-dom';
import { useEditorForm, EditorFormProvider } from '@/hooks/useEditorForm';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Eye, Cloud, Loader2, LayoutPanelLeft, GitBranch, Share2, BarChart2, Settings, Monitor, Palette, MessageSquare } from 'lucide-react';
import CollaboratorAvatars from '@/components/editor/collaboration/CollaboratorAvatars';
import CursorOverlay from '@/components/editor/collaboration/CursorOverlay';
import { AnimatePresence } from 'framer-motion';

const ResponsivePreview = lazy(() => import('@/components/editor/ResponsivePreview'));

const NAV_ITEMS = [
  { path: 'pages', icon: LayoutPanelLeft, label: 'Páginas' },
  { path: 'workflow', icon: GitBranch, label: 'Workflow' },
  { path: 'design', icon: Palette, label: 'Design' },
  { path: 'responses', icon: MessageSquare, label: 'Respostas' },
  { path: 'share', icon: Share2, label: 'Compartilhar' },
  { path: 'analytics', icon: BarChart2, label: 'Análises' },
  { path: 'settings', icon: Settings, label: 'Config.' },
] as const;

function EditorLayoutInner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { id } = useParams();
  const {
    form, saveStatus, lastSavedAt, updateFormData,
    collaborators, broadcastCursor,
    showResponsivePreview, setShowResponsivePreview,
  } = useEditorForm();

  const currentPath = location.pathname.split('/').pop() || 'pages';

  return (
    <div
      className="h-screen flex flex-col bg-background"
      onMouseMove={(e) => broadcastCursor(e.clientX, e.clientY)}
    >
      <CursorOverlay collaborators={collaborators} />
      <header className="flex-shrink-0 border-b border-border bg-card">
        <div className="flex items-center gap-2 sm:gap-3 py-2 sm:py-3 px-3 sm:px-5 overflow-x-auto">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => navigate('/')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-1.5 min-w-0 shrink">
            <Input
              value={form.title}
              onChange={e => updateFormData({ title: e.target.value })}
              className="text-sm sm:text-base font-semibold border-0 shadow-none focus-visible:ring-0 px-0 max-w-[120px] sm:max-w-[200px] bg-transparent"
              placeholder="Título"
            />
          </div>

          {/* Nav */}
          <div className="flex items-center gap-0.5 ml-2 sm:ml-6 border border-border rounded-lg p-0.5 sm:p-1 bg-muted/40 shrink-0">
            {NAV_ITEMS.map(({ path, icon: Icon, label }) => (
              <button
                key={path}
                onClick={() => navigate(`/editor/${id}/${path}`)}
                title={label}
                className={`flex items-center justify-center p-1 sm:p-1.5 rounded-md transition-colors ${
                  currentPath === path
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
                }`}
              >
                <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-4 shrink-0">
            <div className="hidden sm:block">
              <CollaboratorAvatars collaborators={collaborators} />
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
              {saveStatus === 'saving' ? (
                <><Loader2 className="h-3 w-3 animate-spin" /><span>Salvando...</span></>
              ) : saveStatus === 'saved' ? (
                <><Cloud className="h-3 w-3 text-primary" /><span>Salvo {lastSavedAt && formatDistanceToNow(new Date(lastSavedAt), { addSuffix: true, locale: ptBR })}</span></>
              ) : (
                <><Cloud className="h-3 w-3" /><span>Salvo</span></>
              )}
            </div>
            <Button variant="outline" size="sm" className="hidden sm:flex gap-1.5" onClick={() => setShowResponsivePreview(true)}>
              <Monitor className="h-4 w-4" /> Preview
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 sm:hidden" onClick={() => setShowResponsivePreview(true)}>
              <Eye className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={() => updateFormData({ status: form.status === 'published' ? 'draft' : 'published' })}>
              {form.status === 'published' ? 'Despublicar' : 'Publicar'}
            </Button>
          </div>
        </div>
      </header>

      <Suspense fallback={<div className="flex-1 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>}>
        <div className="flex-1 flex overflow-hidden">
          <Outlet />
        </div>
      </Suspense>

      <AnimatePresence>
        {showResponsivePreview && (
          <Suspense fallback={null}>
            <ResponsivePreview formId={form.id} onClose={() => setShowResponsivePreview(false)} />
          </Suspense>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function EditorLayout() {
  return (
    <EditorFormProvider>
      <EditorLayoutInner />
    </EditorFormProvider>
  );
}
