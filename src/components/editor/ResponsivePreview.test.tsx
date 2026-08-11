import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ResponsivePreview from './ResponsivePreview';

describe('ResponsivePreview contrast and accessibility', () => {
  it('exposes the selected device and a named, legible close control', () => {
    const onClose = vi.fn();
    render(
      <ResponsivePreview
        form={{ id: 'form-test', title: 'Teste', status: 'draft', questions: [], pages: [] } as any}
        onClose={onClose}
      />,
    );

    expect(screen.getByRole('button', { name: 'Desktop' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Tablet' })).toHaveAttribute('aria-pressed', 'false');

    const close = screen.getByRole('button', { name: 'Fechar preview' });
    expect(close).toHaveClass(
      'hover:bg-muted',
      'hover:text-foreground',
      'focus-visible:bg-muted',
      'focus-visible:text-foreground',
      'active:bg-muted/80',
      'active:text-foreground',
    );

    expect(screen.getByTitle('Preview Desktop')).toHaveAttribute(
      'sandbox',
      'allow-scripts allow-forms allow-modals allow-popups',
    );
    expect(screen.getByTitle('Preview Desktop')).toHaveAttribute('referrerpolicy', 'no-referrer');

    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('handshakes the current draft into the opaque iframe and confirms the mounted renderer', async () => {
    const form = {
      id: 'draft-form',
      title: 'Rascunho ainda não publicado',
      status: 'draft',
      questions: [],
      pages: [],
    } as any;
    render(<ResponsivePreview form={form} onClose={vi.fn()} />);

    const iframe = screen.getByTitle('Preview Desktop') as HTMLIFrameElement;
    const iframeUrl = new URL(iframe.getAttribute('src')!, 'https://forms.example');
    const previewSession = iframeUrl.searchParams.get('previewSession');
    expect(previewSession).toBeTruthy();
    expect(iframeUrl.searchParams.get('editorPreview')).toBe('1');

    const postMessage = vi.spyOn(iframe.contentWindow!, 'postMessage');
    window.dispatchEvent(new MessageEvent('message', {
      source: iframe.contentWindow,
      data: {
        type: 'forms-editor-preview-ready',
        formId: form.id,
        previewSession,
      },
    }));

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: 'forms-editor-preview-data',
      formId: form.id,
      previewSession,
      form,
    }), '*');

    window.dispatchEvent(new MessageEvent('message', {
      source: iframe.contentWindow,
      data: {
        type: 'forms-editor-preview-mounted',
        formId: form.id,
        previewSession,
      },
    }));

    await waitFor(() => expect(screen.queryByText('Preparando preview…')).not.toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Tablet' }));
    expect(screen.getByTitle('Preview Tablet')).toHaveAttribute(
      'sandbox',
      'allow-scripts allow-forms allow-modals allow-popups',
    );
    expect(screen.getByText('768 × 1024')).toBeInTheDocument();
  });
});
