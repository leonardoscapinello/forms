import React, { useRef, useState } from 'react';
import { FormVariable } from '@/types/form';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Braces, Copy, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface BaseProps {
  variables?: FormVariable[];
  className?: string;
}

interface InputProps extends BaseProps {
  as?: 'input';
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

interface TextareaProps extends BaseProps {
  as: 'textarea';
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  rows?: number;
}

type Props = InputProps | TextareaProps;

/**
 * A text input (or textarea) with a variable picker button.
 * Clicking a variable inserts {{varName}} at the cursor position.
 */
export default function VariableInput(props: Props) {
  const { variables = [], className, value, onChange, placeholder } = props;
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const insertVariable = (varName: string) => {
    const el = inputRef.current;
    const syntax = `{{${varName}}}`;
    if (el) {
      const start = el.selectionStart ?? value.length;
      const end = el.selectionEnd ?? value.length;
      const next = value.slice(0, start) + syntax + value.slice(end);
      onChange(next);
      // Restore cursor after insertion
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + syntax.length;
        el.setSelectionRange(pos, pos);
      });
    } else {
      onChange(value + syntax);
    }
    setOpen(false);
  };

  const copyVar = (varName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`{{${varName}}}`);
    setCopied(varName);
    toast.success(`{{${varName}}} copiado!`);
    setTimeout(() => setCopied(null), 1500);
  };

  const hasVars = variables.length > 0;

  const sharedInputClass = cn('pr-8', className);

  return (
    <div className="relative flex items-start gap-1">
      {/* Input or Textarea */}
      {props.as === 'textarea' ? (
        <Textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          rows={props.rows ?? 2}
          className={cn('flex-1', className)}
        />
      ) : (
        <Input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={cn('flex-1', className)}
        />
      )}

      {/* Variable picker trigger */}
      {hasVars && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn(
                'h-8 w-8 flex-shrink-0 text-muted-foreground hover:text-primary transition-colors',
                props.as === 'textarea' ? 'mt-0.5' : '',
                open && 'text-primary bg-primary/10'
              )}
              title="Inserir variável"
            >
              <Braces className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" sideOffset={4} className="w-64 p-0">
            <div className="p-2 border-b border-border">
              <p className="text-xs font-semibold text-foreground">Inserir variável</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Clique para inserir no cursor
              </p>
            </div>
            <div className="p-1.5 space-y-0.5 max-h-52 overflow-y-auto">
              {variables.map(v => (
                <div
                  key={v.id}
                  className="group flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer transition-colors"
                  onClick={() => insertVariable(v.name)}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono font-medium flex-shrink-0">
                      {`{{${v.name}}}`}
                    </span>
                    <span className="text-xs text-muted-foreground truncate capitalize">{v.type}</span>
                  </div>
                  <button
                    onClick={(e) => copyVar(v.name, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-muted-foreground/10 transition-all"
                    title="Copiar sintaxe"
                  >
                    {copied === v.name
                      ? <Check className="h-3 w-3 text-primary" />
                      : <Copy className="h-3 w-3 text-muted-foreground" />
                    }
                  </button>
                </div>
              ))}
            </div>
            <div className="p-2 border-t border-border bg-muted/30">
              <p className="text-[10px] text-muted-foreground">
                Use <code className="font-mono bg-muted px-1 rounded">{`{{nome}}`}</code> para inserir manualmente
              </p>
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
