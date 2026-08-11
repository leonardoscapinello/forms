import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';
import { buttonVariants } from './buttonVariants';
import { Dialog, DialogContent, DialogTitle } from './dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from './dropdown-menu';
import { Sheet, SheetContent, SheetTitle } from './sheet';

describe('interactive contrast contract', () => {
  it('keeps ghost-button hover, keyboard focus and pressed states on a neutral contrast pair', () => {
    const classes = buttonVariants({ variant: 'ghost' });
    expect(classes).toContain('hover:bg-muted');
    expect(classes).toContain('hover:text-foreground');
    expect(classes).toContain('focus-visible:bg-muted');
    expect(classes).toContain('focus-visible:text-foreground');
    expect(classes).toContain('active:bg-muted/80');
    expect(classes).toContain('active:text-foreground');
  });

  it('keeps outline-button states on the same neutral contrast pair', () => {
    const classes = buttonVariants({ variant: 'outline' });
    expect(classes).toContain('hover:bg-muted');
    expect(classes).toContain('hover:text-foreground');
    expect(classes).toContain('focus-visible:bg-muted');
    expect(classes).toContain('focus-visible:text-foreground');
    expect(classes).toContain('active:bg-muted/80');
    expect(classes).toContain('active:text-foreground');
  });

  it('does not reintroduce a dark background when a ghost action customizes its hover icon color', () => {
    render(
      <Button variant="ghost" aria-label="Excluir" className="text-muted-foreground hover:text-destructive">
        Excluir
      </Button>,
    );

    expect(screen.getByRole('button', { name: 'Excluir' })).toHaveClass(
      'hover:bg-muted',
      'hover:text-destructive',
      'focus-visible:bg-muted',
      'focus-visible:text-foreground',
    );
  });

  it('keeps the dialog close icon legible while open and on hover', () => {
    render(
      <Dialog open>
        <DialogContent>
          <DialogTitle>Janela de teste</DialogTitle>
        </DialogContent>
      </Dialog>,
    );

    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveClass(
      'data-[state=open]:bg-accent',
      'data-[state=open]:text-accent-foreground',
      'hover:bg-accent',
      'hover:text-accent-foreground',
    );
  });

  it('keeps submenu text legible in open and keyboard-focus states', () => {
    render(
      <DropdownMenu open>
        <DropdownMenuTrigger>Menu</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuSub open>
            <DropdownMenuSubTrigger>Mais opções</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>Conteúdo</DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>,
    );

    expect(screen.getByText('Mais opções')).toHaveClass(
      'data-[state=open]:bg-accent',
      'data-[state=open]:text-accent-foreground',
      'focus:bg-accent',
      'focus:text-accent-foreground',
    );
  });

  it('keeps the sheet close icon named and paired with its secondary foreground', () => {
    render(
      <Sheet open>
        <SheetContent>
          <SheetTitle>Painel de teste</SheetTitle>
        </SheetContent>
      </Sheet>,
    );

    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveClass(
      'data-[state=open]:bg-secondary',
      'data-[state=open]:text-secondary-foreground',
      'hover:bg-secondary',
      'hover:text-secondary-foreground',
    );
  });
});
