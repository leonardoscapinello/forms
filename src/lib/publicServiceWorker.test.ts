import { describe, expect, it } from 'vitest';
import {
  isEditorPreviewLocation,
  isOpaqueDocumentOrigin,
  isPublishedFormLocation,
} from './publicServiceWorker';

describe('isPublishedFormLocation', () => {
  it('enables the worker only for a published form route', () => {
    expect(isPublishedFormLocation({ pathname: '/f/form-123', search: '' } as Location)).toBe(true);
    expect(isPublishedFormLocation({ pathname: '/f/form-123', search: '?utm_source=test' } as Location)).toBe(true);
  });

  it('keeps admin and every editor preview outside the worker scope', () => {
    expect(isPublishedFormLocation({ pathname: '/dashboard', search: '' } as Location)).toBe(false);
    expect(isPublishedFormLocation({ pathname: '/f/form-123/internal', search: '' } as Location)).toBe(false);
    expect(isPublishedFormLocation({ pathname: '/f/form-123', search: '?editorPreview=1' } as Location)).toBe(false);
  });

  it('identifies the isolated editor preview before touching Service Worker APIs', () => {
    expect(isEditorPreviewLocation({ pathname: '/f/form-123', search: '?editorPreview=1&previewSession=abc' } as Location)).toBe(true);
    expect(isEditorPreviewLocation({ pathname: '/f/form-123', search: '?utm_source=test' } as Location)).toBe(false);
    expect(isEditorPreviewLocation({ pathname: '/dashboard', search: '?editorPreview=1' } as Location)).toBe(false);
    expect(isOpaqueDocumentOrigin('null')).toBe(true);
    expect(isOpaqueDocumentOrigin('https://forms.example')).toBe(false);
  });
});
