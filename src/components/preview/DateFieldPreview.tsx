import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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
  const hours = parsedDate ? String(parsedDate.getHours()).padStart(2, '0') : '12';
  const minutes = parsedDate ? String(parsedDate.getMinutes()).padStart(2, '0') : '00';

  const formatDisplay = () => {
    if (!parsedDate) return null;
    try {
      if (dateMode === 'time') {
        return `${hours}:${minutes}`;
      }
      const dateStr = format(parsedDate, dateFormat, { locale: ptBR });
      if (dateMode === 'datetime') {
        return `${dateStr} às ${hours}:${minutes}`;
      }
      return dateStr;
    } catch {
      return format(parsedDate, 'dd/MM/yyyy', { locale: ptBR });
    }
  };

  const handleDateSelect = (day: Date | undefined) => {
    if (!day) return;
    if (parsedDate && (dateMode === 'datetime' || dateMode === 'time')) {
      day.setHours(parsedDate.getHours(), parsedDate.getMinutes());
    }
    onChange(day.toISOString());
    if (dateMode === 'date') setOpen(false);
  };

  const handleTimeChange = (type: 'hours' | 'minutes', val: string) => {
    const num = parseInt(val, 10);
    if (isNaN(num)) return;
    const base = parsedDate ? new Date(parsedDate) : new Date();
    if (type === 'hours') base.setHours(Math.min(23, Math.max(0, num)));
    else base.setMinutes(Math.min(59, Math.max(0, num)));
    onChange(base.toISOString());
  };

  const showCalendar = dateMode === 'date' || dateMode === 'datetime';
  const showTime = dateMode === 'time' || dateMode === 'datetime';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
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
            <span>{placeholder || (dateMode === 'time' ? 'Selecione a hora' : 'Selecione a data')}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex flex-col">
          {showCalendar && (
            <Calendar
              mode="single"
              selected={parsedDate}
              onSelect={handleDateSelect}
              locale={ptBR}
              initialFocus
              className={cn('p-3 pointer-events-auto')}
            />
          )}
          {showTime && (
            <div className="flex items-center gap-2 px-4 py-3 border-t border-border">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <input
                type="number"
                min={0}
                max={23}
                value={hours}
                onChange={e => handleTimeChange('hours', e.target.value)}
                className="w-12 text-center bg-muted rounded-md px-2 py-1.5 text-sm font-medium border border-border focus:border-primary outline-none"
              />
              <span className="text-sm font-bold text-muted-foreground">:</span>
              <input
                type="number"
                min={0}
                max={59}
                value={minutes}
                onChange={e => handleTimeChange('minutes', e.target.value)}
                className="w-12 text-center bg-muted rounded-md px-2 py-1.5 text-sm font-medium border border-border focus:border-primary outline-none"
              />
              {dateMode === 'time' && !parsedDate && (
                <Button size="sm" variant="outline" className="ml-auto text-xs" onClick={() => {
                  const now = new Date();
                  onChange(now.toISOString());
                }}>
                  Agora
                </Button>
              )}
              {dateMode === 'datetime' && (
                <Button size="sm" className="ml-auto text-xs" onClick={() => setOpen(false)}>
                  OK
                </Button>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
