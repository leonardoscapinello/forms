import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AlignmentSelector from '@/components/editor/shared/AlignmentSelector';
import ConnectDropMenu from './ConnectDropMenu';
import PageListPanel from './PageListPanel';
import ElementPreview from './page-builder/ElementPreview';
import ElementSettingsPanel from './page-builder/ElementSettingsPanel';
import { createDefaultPageElement } from '@/types/pageElements';

describe('builder UX controls', () => {
  it('explains alignment and exposes recognizable controls', () => {
    const onChange = vi.fn();
    render(<AlignmentSelector value="left" onChange={onChange} />);

    expect(screen.getByText(/como o texto e o conteúdo/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /centro/i }));
    expect(onChange).toHaveBeenCalledWith('center');
  });

  it('searches workflow blocks by purpose, not only by title', () => {
    const callbacks = {
      onAddPage: vi.fn(),
      onAddCondition: vi.fn(),
      onAddVariableOp: vi.fn(),
      onAddIntegration: vi.fn(),
      onAddAnalytics: vi.fn(),
      onAddWhatsApp: vi.fn(),
      onAddEmail: vi.fn(),
      onAddABTest: vi.fn(),
      onAddWait: vi.fn(),
      onAddJump: vi.fn(),
      onAddAI: vi.fn(),
      onAddImageGen: vi.fn(),
      onClose: vi.fn(),
    };
    render(<ConnectDropMenu {...callbacks} />);

    fireEvent.change(screen.getByRole('textbox', { name: /buscar bloco/i }), { target: { value: 'meta' } });
    expect(screen.getByRole('button', { name: /analytics e pixels/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /nova página/i })).not.toBeInTheDocument();
  });

  it('renders inherited element appearance overrides in the field preview', () => {
    const field = createDefaultPageElement('input_text');
    field.label = 'Pergunta com estilo';
    field.description = 'Descrição com estilo';
    field.style = {
      color: '#123456',
      textAlign: 'center',
      fontWeight: '600',
      padding: 18,
      margin: 12,
      width: '75%',
    };

    const { container } = render(<ElementPreview element={field} stepNumber={1} />);
    const title = screen.getByText('Pergunta com estilo').closest('h2') as HTMLElement;
    expect(title).toHaveStyle({ color: '#123456', textAlign: 'center', fontWeight: '600' });

    const styledWrapper = Array.from(container.querySelectorAll('div')).find(node => (
      node.style.padding === '18px'
      && node.style.margin === '12px'
      && node.style.width === '75%'
    ));
    expect(styledWrapper).toBeTruthy();
  });

  it('organizes element settings in a predictable order with clear names', () => {
    const heading = createDefaultPageElement('heading');
    const onChange = vi.fn();
    const { container } = render(
      <ElementSettingsPanel element={heading} onChange={onChange} onClose={vi.fn()} />,
    );

    const sectionNames = Array.from(container.querySelectorAll('button[data-settings-section]'))
      .map(button => button.getAttribute('data-settings-section'));
    expect(sectionNames).toEqual(['content', 'appearance', 'spacing', 'advanced']);
    expect(screen.queryByText('Exterior')).not.toBeInTheDocument();
  });

  it('contains the settings content inside the available sidebar width', () => {
    const heading = createDefaultPageElement('heading');
    const { container } = render(
      <ElementSettingsPanel element={heading} onChange={vi.fn()} onClose={vi.fn()} />,
    );

    expect(container.firstElementChild).toHaveClass('min-w-0', 'max-w-full', 'overflow-hidden');
    const viewport = container.querySelector('[data-radix-scroll-area-viewport]');
    expect(viewport).toHaveClass('w-full', 'min-w-0');
    expect(container.querySelector('.overflow-x-hidden')).toHaveClass('w-full', 'min-w-0', 'max-w-full');
  });

  it('allows renaming a page from the structure sidebar', () => {
    const onRenamePage = vi.fn();
    render(
      <PageListPanel
        pages={[{ id: 'page-1', title: 'Página antiga', elements: [] }]}
        selectedPageId="page-1"
        onSelectPage={vi.fn()}
        onAddPage={vi.fn()}
        onDeletePage={vi.fn()}
        onRenamePage={onRenamePage}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Renomear Página antiga' }));
    const nameInput = screen.getByRole('textbox', { name: 'Nome da página' });
    fireEvent.change(nameInput, { target: { value: 'Página nova' } });
    fireEvent.keyDown(nameInput, { key: 'Enter' });

    expect(onRenamePage).toHaveBeenCalledWith('page-1', 'Página nova');
  });
});
