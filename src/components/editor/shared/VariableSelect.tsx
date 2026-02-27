import { useState } from 'react';
import { FormVariable, FormVariableType } from '@/types/form';
import { Plus } from 'lucide-react';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface Props {
  value: string;
  variables: FormVariable[];
  onValueChange: (variableId: string) => void;
  onCreateVariable?: (variable: FormVariable) => void;
  placeholder?: string;
  className?: string;
  /** Accent class for the variable name display */
  accentClass?: string;
}

/**
 * A Select for picking a form variable, with an inline "create new" option.
 * When the user clicks "+ Nova variável", it shows an inline input to name and create it.
 */
export default function VariableSelect({
  value,
  variables,
  onValueChange,
  onCreateVariable,
  placeholder = 'Variável...',
  className,
  accentClass = 'text-primary',
}: Props) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<FormVariableType>('text');

  const handleCreate = () => {
    if (!newName.trim() || !onCreateVariable) return;
    const sanitized = newName.trim().replace(/\s+/g, '_').toLowerCase();
    const newVar: FormVariable = {
      id: crypto.randomUUID(),
      name: sanitized,
      type: newType,
      defaultValue: '',
    };
    onCreateVariable(newVar);
    onValueChange(newVar.id);
    setCreating(false);
    setNewName('');
    setNewType('text');
  };

  if (creating) {
    return (
      <div className="flex items-center gap-1.5 flex-1">
        <Input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="nome_variavel"
          className="h-7 text-xs font-mono flex-1"
          autoFocus
          onKeyDown={e => {
            if (e.key === 'Enter') handleCreate();
            if (e.key === 'Escape') { setCreating(false); setNewName(''); }
          }}
        />
        <select
          value={newType}
          onChange={e => setNewType(e.target.value as FormVariableType)}
          className="h-7 text-[10px] bg-muted border border-border rounded px-1"
        >
          <option value="text">Texto</option>
          <option value="number">Número</option>
          <option value="boolean">Bool</option>
        </select>
        <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={handleCreate} disabled={!newName.trim()}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={val => {
      if (val === '__create__') {
        setCreating(true);
      } else {
        onValueChange(val);
      }
    }}>
      <SelectTrigger className={`h-7 text-xs flex-1 ${className || ''}`}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {variables.map(v => (
          <SelectItem key={v.id} value={v.id} className="text-xs">
            <span className={`font-mono ${accentClass}`}>{`{{${v.name}}}`}</span>
            <span className="ml-1.5 text-muted-foreground">({v.type})</span>
          </SelectItem>
        ))}
        {onCreateVariable && (
          <SelectItem value="__create__" className="text-xs text-primary">
            <span className="flex items-center gap-1">
              <Plus className="h-3 w-3" />
              Nova variável
            </span>
          </SelectItem>
        )}
      </SelectContent>
    </Select>
  );
}
