import { describe, expect, it } from 'vitest';
import { omitAdminOnlyPublicFormFields } from '../../supabase/functions/_shared/publicFormProjection.ts';

describe('public form projection', () => {
  it('keeps renderer data but removes administrative destinations and metrics', () => {
    const projected = omitAdminOnlyPublicFormFields({
      pages: [{ id: 'page-1' }],
      style: { primaryColor: '#111111' },
      completionWebhookUrl: 'https://owner.example/hook',
      googleSheetId: 'private-sheet-id',
      googleSheetUrl: 'https://docs.google.com/spreadsheets/d/private-sheet-id',
      notFoundRedirectUrl: 'https://owner.example/unavailable',
      responseCount: 42,
      completionRate: 80,
      nodePositions: [{ id: 'node', x: 1, y: 2 }],
      enableSentimentAnalysis: true,
    });

    expect(projected).toEqual({
      pages: [{ id: 'page-1' }],
      style: { primaryColor: '#111111' },
    });
  });

  it('removes webhook destinations embedded by the legacy question model', () => {
    const projected = omitAdminOnlyPublicFormFields({
      questions: [{
        id: 'legacy-hook',
        type: 'webhook',
        title: 'Entrega antiga',
        webhookUrl: 'https://hooks.example.test/path?token=secret',
        webhookMethod: 'POST',
      }],
    });

    expect(projected.questions).toEqual([{
      id: 'legacy-hook',
      type: 'webhook',
      title: 'Entrega antiga',
    }]);
    expect(JSON.stringify(projected)).not.toContain('secret');
  });
});
