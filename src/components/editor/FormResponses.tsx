import { FormData } from '@/types/form';

interface Props {
  form: FormData;
}

export default function FormResponses({ form }: Props) {
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="text-center space-y-4 max-w-md">
        <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center">
          <span className="text-2xl">📋</span>
        </div>
        <h2 className="text-xl font-semibold text-foreground">Respostas</h2>
        <p className="text-sm text-muted-foreground">
          {form.responseCount > 0
            ? `${form.responseCount} respostas coletadas até agora.`
            : 'Nenhuma resposta recebida ainda. Publique e compartilhe o formulário para começar a coletar respostas.'}
        </p>
        {form.responseCount > 0 && (
          <div className="grid grid-cols-2 gap-4 pt-4">
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-2xl font-bold text-foreground">{form.responseCount}</p>
              <p className="text-xs text-muted-foreground">Total de respostas</p>
            </div>
            <div className="rounded-lg border border-border bg-card p-4">
              <p className="text-2xl font-bold text-foreground">{form.completionRate}%</p>
              <p className="text-xs text-muted-foreground">Taxa de conclusão</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
