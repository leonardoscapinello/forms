/**
 * Lightweight rich text editor using contentEditable.
 * Supports: bold, italic, underline, strikethrough, text color, font size, alignment.
 * Stores content as HTML string.
 */
import { useRef, useCallback, useState, useEffect } from 'react';
import {
  Bold, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight,
  Paintbrush, Type, Undo2, Redo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
}

const FONT_SIZES = [
  { label: 'Pequeno', value: '2', css: '13px' },
  { label: 'Normal', value: '3', css: '16px' },
  { label: 'Médio', value: '4', css: '18px' },
  { label: 'Grande', value: '5', css: '24px' },
  { label: 'Muito grande', value: '6', css: '32px' },
];

const COLORS = [
  '#000000', '#374151', '#6B7280', '#9CA3AF',
  '#DC2626', '#EA580C', '#D97706', '#CA8A04',
  '#16A34A', '#059669', '#0D9488', '#0891B2',
  '#2563EB', '#4F46E5', '#7C3AED', '#9333EA',
  '#DB2777', '#E11D48', '#FFFFFF', '#F3F4F6',
];

export default function RichTextEditor({ value, onChange, placeholder, className }: Props) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isInternalChange = useRef(false);
  const [activeFormats, setActiveFormats] = useState<Set<string>>(new Set());

  // Sync value from parent only when not internally editing
  useEffect(() => {
    if (isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value || '';
    }
  }, [value]);

  const emitChange = useCallback(() => {
    if (!editorRef.current) return;
    isInternalChange.current = true;
    onChange(editorRef.current.innerHTML);
  }, [onChange]);

  const execCmd = useCallback((cmd: string, val?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    emitChange();
    updateActiveFormats();
  }, [emitChange]);

  const updateActiveFormats = useCallback(() => {
    const formats = new Set<string>();
    if (document.queryCommandState('bold')) formats.add('bold');
    if (document.queryCommandState('italic')) formats.add('italic');
    if (document.queryCommandState('underline')) formats.add('underline');
    if (document.queryCommandState('strikeThrough')) formats.add('strikeThrough');
    setActiveFormats(formats);
  }, []);

  const handleInput = useCallback(() => {
    emitChange();
    updateActiveFormats();
  }, [emitChange, updateActiveFormats]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Prevent Enter from creating divs — use br instead
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      document.execCommand('insertLineBreak');
      emitChange();
    }
  }, [emitChange]);

  const ToolbarBtn = ({ cmd, icon: Icon, active }: { cmd: string; icon: React.ElementType; active?: boolean }) => (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn('h-7 w-7', active && 'bg-accent text-accent-foreground')}
      onMouseDown={e => { e.preventDefault(); execCmd(cmd); }}
    >
      <Icon className="h-3.5 w-3.5" />
    </Button>
  );

  const isEmpty = !value || value === '<br>' || value === '<p><br></p>' || value.replace(/<[^>]*>/g, '').trim() === '';

  return (
    <div className={cn('rounded-lg border border-border overflow-hidden bg-card', className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-1 py-1 border-b border-border bg-muted/30 flex-wrap">
        <ToolbarBtn cmd="bold" icon={Bold} active={activeFormats.has('bold')} />
        <ToolbarBtn cmd="italic" icon={Italic} active={activeFormats.has('italic')} />
        <ToolbarBtn cmd="underline" icon={Underline} active={activeFormats.has('underline')} />
        <ToolbarBtn cmd="strikeThrough" icon={Strikethrough} active={activeFormats.has('strikeThrough')} />

        <div className="w-px h-5 bg-border mx-0.5" />

        {/* Font size */}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onMouseDown={e => e.preventDefault()}>
              <Type className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-36 p-1" align="start" side="bottom">
            {FONT_SIZES.map(s => (
              <button
                key={s.value}
                className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-muted transition-colors"
                onMouseDown={e => { e.preventDefault(); execCmd('fontSize', s.value); }}
              >
                <span style={{ fontSize: s.css }}>{s.label}</span>
              </button>
            ))}
          </PopoverContent>
        </Popover>

        {/* Text color */}
        <Popover>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onMouseDown={e => e.preventDefault()}>
              <Paintbrush className="h-3.5 w-3.5" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-2" align="start" side="bottom">
            <p className="text-[10px] font-medium text-muted-foreground mb-1.5 uppercase tracking-wider">Cor do texto</p>
            <div className="grid grid-cols-5 gap-1">
              {COLORS.map(c => (
                <button
                  key={c}
                  className="w-7 h-7 rounded-md border border-border hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }}
                  onMouseDown={e => { e.preventDefault(); execCmd('foreColor', c); }}
                />
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <div className="w-px h-5 bg-border mx-0.5" />

        {/* Alignment */}
        <ToolbarBtn cmd="justifyLeft" icon={AlignLeft} />
        <ToolbarBtn cmd="justifyCenter" icon={AlignCenter} />
        <ToolbarBtn cmd="justifyRight" icon={AlignRight} />

        <div className="w-px h-5 bg-border mx-0.5" />

        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onMouseDown={e => { e.preventDefault(); execCmd('undo'); }}>
          <Undo2 className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onMouseDown={e => { e.preventDefault(); execCmd('redo'); }}>
          <Redo2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Editor area */}
      <div className="relative">
        {isEmpty && placeholder && (
          <div className="absolute inset-0 px-3 py-2 text-sm text-muted-foreground/50 pointer-events-none select-none">
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className="min-h-[120px] px-3 py-2 text-sm text-foreground outline-none leading-relaxed focus:ring-0 [&_b]:font-bold [&_i]:italic [&_u]:underline [&_strike]:line-through"
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          onMouseUp={updateActiveFormats}
          onKeyUp={updateActiveFormats}
          onFocus={updateActiveFormats}
          dangerouslySetInnerHTML={{ __html: value || '' }}
        />
      </div>
    </div>
  );
}
