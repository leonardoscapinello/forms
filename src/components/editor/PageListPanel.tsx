import { FunnelPage, createDefaultFunnelPage } from '@/types/form';
import { Plus, FileText, Trash2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  pages: FunnelPage[];
  selectedPageId: string | null;
  onSelectPage: (pageId: string) => void;
  onAddPage: () => void;
  onDeletePage: (pageId: string) => void;
  onRenamePage: (pageId: string, title: string) => void;
}

export default function PageListPanel({ pages, selectedPageId, onSelectPage, onAddPage, onDeletePage, onRenamePage }: Props) {
  return (
    <div className="w-72 border-r border-border bg-card flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Páginas</h2>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onAddPage}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Page list */}
      <div className="flex-1 overflow-auto p-2 space-y-1">
        {pages.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nenhuma página</p>
            <p className="text-xs mt-1">Clique em + para adicionar</p>
          </div>
        ) : (
          pages.map((page, index) => (
            <div
              key={page.id}
              className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                selectedPageId === page.id
                  ? 'bg-primary/10 text-primary border border-primary/20'
                  : 'hover:bg-muted border border-transparent'
              }`}
              onClick={() => onSelectPage(page.id)}
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-xs text-muted-foreground font-mono w-5 text-center flex-shrink-0">
                  {index + 1}
                </span>
                <FileText className="h-4 w-4 flex-shrink-0" />
                <span className="text-sm font-medium truncate">{page.title || 'Sem título'}</span>
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <span className="text-[10px] text-muted-foreground">
                  {page.elements?.length || 0}
                </span>
                {pages.length > 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onDeletePage(page.id); }}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add button at bottom */}
      <div className="p-3 border-t border-border">
        <Button variant="outline" className="w-full border-dashed" size="sm" onClick={onAddPage}>
          <Plus className="mr-2 h-4 w-4" />
          Nova página
        </Button>
      </div>
    </div>
  );
}
