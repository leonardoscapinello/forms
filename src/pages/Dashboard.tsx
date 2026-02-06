import { useNavigate } from 'react-router-dom';
import { useFormStore } from '@/hooks/useFormStore';
import { Plus, FileText, MoreHorizontal, Trash2 } from 'lucide-react';
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

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="container mx-auto flex items-center justify-between py-4 px-6">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            FormFlow
          </h1>
          <Button onClick={handleCreate} size="sm">
            <Plus className="mr-2 h-4 w-4" />
            Novo formulário
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-6 py-10">
        {forms.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="rounded-full bg-muted p-4 mb-4">
              <FileText className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-medium text-foreground mb-1">
              Nenhum formulário ainda
            </h2>
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
                  className="group cursor-pointer rounded-lg border border-border bg-card p-5 transition-shadow hover:shadow-md"
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
