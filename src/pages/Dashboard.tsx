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
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-semibold text-foreground tracking-tight">
            Bom dia! 👋
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Aqui está o resumo dos seus formulários.
          </p>
        </div>
        <Button onClick={handleCreate} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Novo formulário
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <FileText className="h-3.5 w-3.5" />
            Total de formulários
          </div>
          <p className="text-2xl font-bold text-foreground">{forms.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <CheckCircle className="h-3.5 w-3.5" />
            Publicados
          </div>
          <p className="text-2xl font-bold text-foreground">{publishedCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
            <BarChart3 className="h-3.5 w-3.5" />
            Total de respostas
          </div>
          <p className="text-2xl font-bold text-foreground">{totalResponses}</p>
        </div>
      </div>

      {/* Forms */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
          Seus formulários
        </h2>

        {forms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center rounded-xl border border-border bg-card">
            <div className="rounded-full bg-muted p-4 mb-4">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-base font-medium text-foreground mb-1">
              Nenhum formulário ainda
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              Crie seu primeiro formulário para começar a coletar respostas.
            </p>
            <Button onClick={handleCreate}>
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
                  className="group cursor-pointer rounded-xl border border-border bg-card p-5 transition-all hover:shadow-sm"
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
      </div>
    </div>
  );
}
