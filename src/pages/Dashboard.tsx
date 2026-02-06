import { useNavigate } from 'react-router-dom';
import { useFormStore } from '@/hooks/useFormStore';
import { Plus, FileText, MoreHorizontal, Trash2, BarChart3, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const STATUS_MAP = {
  draft: { label: 'Rascunho', variant: 'secondary' as const },
  published: { label: 'Publicado', variant: 'default' as const },
  archived: { label: 'Arquivado', variant: 'outline' as const },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const { forms, createForm, deleteForm } = useFormStore();

  const handleCreate = () => {
    const form = createForm();
    navigate(`/editor/${form.id}`);
  };

  const totalResponses = forms.reduce((sum, f) => sum + f.responseCount, 0);
  const publishedCount = forms.filter(f => f.status === 'published').length;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50">
        <div className="container mx-auto flex items-center justify-between py-5 px-6">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center">
              <span className="text-sm font-bold text-primary-foreground">F</span>
            </div>
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              FormFlow
            </h1>
          </div>
          <Button onClick={handleCreate} size="sm" className="gradient-primary border-0 text-primary-foreground hover:opacity-90">
            <Plus className="mr-2 h-4 w-4" />
            Novo formulário
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-6 py-10">
        {/* Stats */}
        {forms.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="rounded-xl border border-border/50 bg-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <FileText className="h-3.5 w-3.5" />
                Total de formulários
              </div>
              <p className="text-2xl font-bold text-foreground">{forms.length}</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <CheckCircle className="h-3.5 w-3.5" />
                Publicados
              </div>
              <p className="text-2xl font-bold text-foreground">{publishedCount}</p>
            </div>
            <div className="rounded-xl border border-border/50 bg-card p-4">
              <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1">
                <BarChart3 className="h-3.5 w-3.5" />
                Total de respostas
              </div>
              <p className="text-2xl font-bold text-foreground">{totalResponses}</p>
            </div>
          </div>
        )}

        {forms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="rounded-full bg-accent p-4 mb-4 glow-primary">
              <FileText className="h-8 w-8 text-accent-foreground" />
            </div>
            <h2 className="text-lg font-medium text-foreground mb-1">
              Nenhum formulário ainda
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              Crie seu primeiro formulário para começar a coletar respostas.
            </p>
            <Button onClick={handleCreate} className="gradient-primary border-0 text-primary-foreground hover:opacity-90">
              <Plus className="mr-2 h-4 w-4" />
              Criar formulário
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {forms.map(form => {
              const status = STATUS_MAP[form.status];
              return (
                <div
                  key={form.id}
                  onClick={() => navigate(`/editor/${form.id}`)}
                  className="group cursor-pointer rounded-xl border border-border/50 bg-card p-5 transition-all hover:border-glow hover:glow-primary"
                >
                  <div className="flex items-start justify-between mb-3">
                    <Badge variant={status.variant}>{status.label}</Badge>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover:opacity-100">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={e => {
                            e.stopPropagation();
                            deleteForm(form.id);
                          }}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Excluir
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <h3 className="font-medium text-foreground truncate mb-1">
                    {form.title}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {form.questions.length} pergunta{form.questions.length !== 1 ? 's' : ''} · {form.responseCount} resposta{form.responseCount !== 1 ? 's' : ''}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
