import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, Clock, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface Props {
  value: any;
  onChange: (val: any) => void;
  dateMode?: 'date' | 'time' | 'datetime';
  dateFormat?: string;
  placeholder?: string;
}

export default function DateFieldPreview({ value, onChange, dateMode = 'date', dateFormat = 'dd/MM/yyyy', placeholder }: Props) {
  const [open, setOpen] = useState(false);

  const parsedDate = value ? new Date(value) : undefined;
  const hours = parsedDate ? parsedDate.getHours() : 12;
  const minutes = parsedDate ? parsedDate.getMinutes() : 0;

  const formatDisplay = () => {
    if (!parsedDate) return null;
    try {
      if (dateMode === 'time') {
        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      }
      const dateStr = format(parsedDate, dateFormat, { locale: ptBR });
      if (dateMode === 'datetime') {
        return `${dateStr} às ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
      }
      return dateStr;
    } catch {
      return format(parsedDate, 'dd/MM/yyyy', { locale: ptBR });
    }
  };

  const handleDateSelect = (day: Date | undefined) => {
    if (!day) return;
    if (parsedDate) {
      day.setHours(parsedDate.getHours(), parsedDate.getMinutes());
    }
    onChange(day.toISOString());
    if (dateMode === 'date') setOpen(false);
  };

  const adjustTime = (type: 'hours' | 'minutes', delta: number) => {
    const base = parsedDate ? new Date(parsedDate) : new Date();
    if (!parsedDate) {
      base.setHours(12, 0, 0, 0);
      onChange(base.toISOString());
    }
    if (type === 'hours') {
      const h = (base.getHours() + delta + 24) % 24;
      base.setHours(h);
    } else {
      const m = (base.getMinutes() + delta + 60) % 60;
      base.setMinutes(m);
    }
    onChange(base.toISOString());
  };

  const showCalendar = dateMode === 'date' || dateMode === 'datetime';
  const showTime = dateMode === 'time' || dateMode === 'datetime';

  const title = dateMode === 'time' ? 'Selecione a hora' : dateMode === 'datetime' ? 'Selecione data e hora' : 'Selecione a data';

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'w-full flex items-center gap-3 bg-transparent border-0 border-b-2 border-border focus:border-primary outline-none text-base md:text-lg py-2 text-left transition-colors',
          !parsedDate && 'text-muted-foreground/40'
        )}
      >
        {dateMode === 'time' ? (
          <Clock className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        ) : (
          <CalendarIcon className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        )}
        {parsedDate ? (
          <span className="text-foreground">{formatDisplay()}</span>
        ) : (
          <span>{placeholder || title}</span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle className="text-lg">{title}</DialogTitle>
          </DialogHeader>

          {showCalendar && (
            <div className="flex justify-center px-4">
              <Calendar
                mode="single"
                selected={parsedDate}
                onSelect={handleDateSelect}
                locale={ptBR}
                initialFocus
                className={cn('p-3 pointer-events-auto')}
              />
            </div>
          )}

          {showTime && (
            <div className="border-t border-border bg-muted/30 px-6 py-5">
              <p className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
                <Clock className="h-4 w-4" />
                Horário
              </p>
              <div className="flex items-center justify-center gap-3">
                {/* Hours */}
                <div className="flex flex-col items-center gap-1">
                  <button
                    onClick={() => adjustTime('hours', 1)}
                    className="p-2 rounded-lg hover:bg-muted transition-colors"
                  >
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  </button>
                  <div className="w-16 h-14 rounded-xl bg-background border-2 border-border flex items-center justify-center text-2xl font-bold text-foreground tabular-nums">
                    {String(hours).padStart(2, '0')}
                  </div>
                  <button
                    onClick={() => adjustTime('hours', -1)}
                    className="p-2 rounded-lg hover:bg-muted transition-colors"
                  >
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  </button>
                </div>

                <span className="text-3xl font-bold text-muted-foreground mt-[-2px]">:</span>

                {/* Minutes */}
                <div className="flex flex-col items-center gap-1">
                  <button
                    onClick={() => adjustTime('minutes', 5)}
                    className="p-2 rounded-lg hover:bg-muted transition-colors"
                  >
                    <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  </button>
                  <div className="w-16 h-14 rounded-xl bg-background border-2 border-border flex items-center justify-center text-2xl font-bold text-foreground tabular-nums">
                    {String(minutes).padStart(2, '0')}
                  </div>
                  <button
                    onClick={() => adjustTime('minutes', -5)}
                    className="p-2 rounded-lg hover:bg-muted transition-colors"
                  >
                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="px-6 py-4 border-t border-border flex justify-end gap-2">
            {parsedDate && (
              <Button variant="ghost" size="sm" onClick={() => { onChange(undefined); setOpen(false); }}>
                Limpar
              </Button>
            )}
            <Button size="sm" onClick={() => setOpen(false)}>
              Confirmar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
