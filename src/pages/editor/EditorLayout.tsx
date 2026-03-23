import '@/editor.css';
import { Suspense, lazy, useMemo, useState as useReactState } from 'react';
import { Outlet, useNavigate, useLocation, useParams } from 'react-router-dom';
import { useEditorForm, EditorFormProvider } from '@/hooks/useEditorForm';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Eye, Cloud, Loader2, LayoutPanelLeft, GitBranch, Share2, BarChart2, Settings, Monitor, Palette, MessageSquare, Search, ChevronDown, AlertTriangle, X } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import CollaboratorAvatars from '@/components/editor/collaboration/CollaboratorAvatars';
import CursorOverlay from '@/components/editor/collaboration/CursorOverlay';
import { AnimatePresence, motion } from 'framer-motion';
import { validateFormIntegrity, type IntegrityIssue } from '@/lib/formIntegrityValidator';
import { toast } from 'sonner';

const ResponsivePreview = lazy(() => import('@/components/editor/ResponsivePreview'));

const NAV_ITEMS = [
  { path: 'pages', icon: LayoutPanelLeft, label: 'Páginas' },
  { path: 'workflow', icon: GitBranch, label: 'Workflow' },
  { path: 'design', icon: Palette, label: 'Design' },
  { path: 'responses', icon: MessageSquare, label: 'Respostas' },
  { path: 'share', icon: Share2, label: 'Compartilhar' },
  { path: 'analytics', icon: BarChart2, label: 'Análises' },
  { path: 'seo', icon: Search, label: 'SEO' },
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
  const [showIntegrityBanner, setShowIntegrityBanner] = useReactState(false);

  const integrityIssues = useMemo(() => validateFormIntegrity(form), [form]);
  const hasIssues = integrityIssues.length > 0;

  const handleStatusChange = (status: string) => {
    if (status === 'published' && hasIssues) {
      setShowIntegrityBanner(true);
      toast.error(
        `Não é possível publicar: ${integrityIssues.length} problema${integrityIssues.length > 1 ? 's' : ''} de integridade`,
        {
          description: integrityIssues.slice(0, 3).map(i => `• ${i.description}`).join('\n')
            + (integrityIssues.length > 3 ? `\n• ... e mais ${integrityIssues.length - 3}` : ''),
          duration: 8000,
        }
      );
      return;
    }
    updateFormData({ status: status as any });
  };

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
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
                }`}
              >
                <Icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-4 shrink-0">
            {/* Integrity warning badge */}
            {hasIssues && (
              <button
                onClick={() => setShowIntegrityBanner(prev => !prev)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs font-medium hover:bg-destructive/20 transition-colors animate-in fade-in"
                title={`${integrityIssues.length} problema${integrityIssues.length > 1 ? 's' : ''} de integridade`}
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{integrityIssues.length}</span>
              </button>
            )}
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
            <button
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted transition-colors text-xs font-medium text-foreground"
              onClick={() => setShowResponsivePreview(true)}
            >
              <Monitor className="h-3.5 w-3.5" /> Preview
            </button>
            <Button variant="ghost" size="icon" className="h-8 w-8 sm:hidden" onClick={() => setShowResponsivePreview(true)}>
              <Eye className="h-4 w-4" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card hover:bg-muted transition-colors text-sm font-medium">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    form.status === 'published' ? 'bg-emerald-500' :
                    form.status === 'closed' ? 'bg-destructive' :
                    'bg-muted-foreground/50'
                  }`} />
                  <span className="text-foreground text-xs">
                    {form.status === 'published' ? 'Ativo' : form.status === 'closed' ? 'Fechado' : 'Rascunho'}
                  </span>
                  <ChevronDown className="h-3 w-3 text-muted-foreground" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[150px]">
                <DropdownMenuItem onClick={() => handleStatusChange('draft')} className="text-xs gap-2">
                  <span className="w-2 h-2 rounded-full bg-muted-foreground/50" />
                  Rascunho
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => handleStatusChange('published')}
                  className={`text-xs gap-2 ${hasIssues ? 'opacity-60' : ''}`}
                >
                  <span className={`w-2 h-2 rounded-full ${hasIssues ? 'bg-destructive' : 'bg-emerald-500'}`} />
                  Ativo
                  {hasIssues && <AlertTriangle className="h-3 w-3 text-destructive ml-auto" />}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => handleStatusChange('closed')} className="text-xs gap-2">
                  <span className="w-2 h-2 rounded-full bg-destructive" />
                  Fechado
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* Integrity issues banner */}
      <AnimatePresence>
        {showIntegrityBanner && hasIssues && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="bg-destructive/5 border-b border-destructive/20 px-4 py-3">
              <div className="flex items-start justify-between gap-3 max-w-4xl mx-auto">
                <div className="flex items-start gap-2.5 min-w-0">
                  <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                  <div className="text-xs space-y-1.5">
                    <p className="font-semibold text-destructive">
                      {integrityIssues.length} problema{integrityIssues.length > 1 ? 's' : ''} de integridade — publicação bloqueada
                    </p>
                    <ul className="space-y-1 text-destructive/80">
                      {integrityIssues.map((issue, i) => (
                        <li key={i} className="flex items-start gap-1.5">
                          <span className="shrink-0 mt-0.5">•</span>
                          <span>
                            <strong>{issue.nodeLabel}:</strong> {issue.description}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="text-muted-foreground italic">
                      Mova os campos referenciados para antes dos nós que os utilizam no workflow, ou ajuste as referências.
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setShowIntegrityBanner(false)}
                  className="shrink-0 p-1 rounded hover:bg-destructive/10 text-destructive/60 hover:text-destructive transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex overflow-hidden">
        <Suspense fallback={null}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={currentPath}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="flex-1 flex overflow-hidden"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </Suspense>
      </div>

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
