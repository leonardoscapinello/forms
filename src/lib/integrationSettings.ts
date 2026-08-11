import { supabase } from '@/integrations/supabase/client';

export const MASKED_INTEGRATION_SECRET = '••••••••';

export type IntegrationValidationStatus =
  | 'validated'
  | 'validated_restricted'
  | 'partially_validated'
  | 'oauth_pending'
  | 'disabled';

export type SafeIntegrationSetting = {
  id: string;
  integration_type: string;
  label: string;
  is_active: boolean;
  config: Record<string, any>;
  created_at?: string;
  updated_at?: string;
  validation?: { status: IntegrationValidationStatus; message?: string };
};

export async function withIntegrationTimeout<T>(
  request: Promise<T>,
  timeoutMs = 20_000,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('A validação demorou demais. Tente novamente.')), timeoutMs);
  });
  return Promise.race([request, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}

const INTEGRATION_ERROR_MESSAGES: Record<string, string> = {
  integration_settings_failed: 'Não foi possível processar a integração.',
  integration_request_timeout: 'A validação demorou demais. Tente novamente.',
  openai_api_key_required: 'Informe a API key da OpenAI.',
  openai_model_required: 'Selecione um modelo da OpenAI.',
  openai_model_unavailable: 'O modelo selecionado não está disponível para essa API key.',
  openai_credentials_invalid: 'A API key da OpenAI foi recusada.',
  openai_connection_failed: 'Não foi possível conectar à OpenAI.',
  resend_api_key_required: 'Informe a API key do Resend.',
  resend_default_from_required: 'Informe o e-mail remetente padrão do Resend.',
  resend_default_from_invalid: 'Informe um e-mail remetente válido.',
  resend_sender_domain_unverified: 'O remetente não pertence a um domínio verificado e habilitado para envio no Resend.',
  resend_credentials_invalid: 'A API key do Resend foi recusada.',
  resend_connection_failed: 'Não foi possível conectar ao Resend.',
  evolution_api_url_required: 'Informe a URL da Evolution API.',
  evolution_api_key_required: 'Informe a API key da Evolution API.',
  evolution_instance_required: 'Selecione uma instância da Evolution API.',
  evolution_instance_not_connected: 'A instância da Evolution API não está conectada.',
  evolution_invalid_api_url: 'A URL da Evolution API é inválida ou insegura.',
  evolution_connection_failed: 'Não foi possível conectar à Evolution API.',
  evolution_credentials_invalid: 'A Evolution API recusou as credenciais.',
  google_client_id_required: 'Informe o Client ID do Google.',
  google_client_secret_required: 'Informe o Client Secret do Google.',
  google_client_id_invalid: 'O Client ID do Google não tem o formato esperado.',
  reoon_api_key_required: 'Informe a API key do Reoon.',
  reoon_credentials_invalid: 'A API key do Reoon foi recusada.',
  reoon_connection_failed: 'Não foi possível conectar ao Reoon.',
  minio_validation_unavailable: 'A validação do MinIO não está disponível no servidor.',
  minio_connection_failed: 'Não foi possível conectar ao MinIO com essas credenciais.',
  meta_pixel_id_required: 'Informe o Pixel ID da Meta.',
  meta_capi_token_required: 'Informe o token da API de Conversões da Meta.',
  meta_credentials_invalid: 'A Meta recusou o Pixel ID ou o token informado.',
  meta_connection_failed: 'Não foi possível conectar à Meta.',
  ga4_measurement_id_required: 'Informe o Measurement ID do GA4.',
  ga4_api_secret_required: 'Informe o API Secret do GA4.',
  ga4_credentials_invalid: 'O GA4 recusou as credenciais informadas.',
  ga4_payload_invalid: 'O validador do GA4 recusou o payload de teste.',
  ga4_connection_failed: 'Não foi possível conectar ao Google Analytics.',
  tiktok_pixel_id_required: 'Informe o Pixel ID do TikTok.',
  tiktok_access_token_required: 'Informe o Access Token do TikTok.',
  linkedin_partner_id_required: 'Informe o Partner ID do LinkedIn.',
  linkedin_conversion_id_required: 'Informe o Conversion ID do LinkedIn.',
  linkedin_access_token_required: 'Informe o Access Token do LinkedIn.',
  linkedin_credentials_invalid: 'O LinkedIn recusou as credenciais informadas.',
  linkedin_connection_failed: 'Não foi possível conectar ao LinkedIn.',
  webhook_url_required: 'Informe a URL do webhook.',
  webhook_connection_failed: 'Não foi possível conectar ao webhook informado.',
  integration_catalog_failed: 'Não foi possível carregar as integrações disponíveis.',
  integration_list_failed: 'Não foi possível carregar as configurações de integração.',
  integration_save_failed: 'Não foi possível salvar a integração.',
  integration_delete_failed: 'Não foi possível excluir a integração.',
  invalid_integration_type: 'Tipo de integração inválido.',
  internal_error: 'O servidor não conseguiu concluir a validação da integração.',
};

function integrationErrorMessage(code: unknown): string {
  const key = typeof code === 'string' ? code : '';
  return INTEGRATION_ERROR_MESSAGES[key] || key || 'Não foi possível processar a integração.';
}

async function invoke<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await withIntegrationTimeout(
    supabase.functions.invoke('integration-settings', { body }),
  );
  if (error) {
    let message = error.message || 'integration_settings_failed';
    try {
      const details = await (error as any)?.context?.json?.();
      message = integrationErrorMessage(details?.message || details?.error || message);
    } catch {
      // The Functions client does not always expose a JSON response body.
    }
    throw new Error(message);
  }
  if (!data?.success) throw new Error(integrationErrorMessage(data?.error || 'integration_settings_failed'));
  return data as T;
}

export async function runIntegrationSettingsAction<T>(
  body: Record<string, unknown>,
): Promise<T> {
  return invoke<T>(body);
}

export async function listIntegrationSettings(integrationType: string): Promise<SafeIntegrationSetting[]> {
  const result = await invoke<{ success: true; rows: SafeIntegrationSetting[] }>({
    action: 'list',
    integrationType,
  });
  return result.rows;
}

export async function listIntegrationCatalog(integrationType: string): Promise<SafeIntegrationSetting[]> {
  const result = await invoke<{ success: true; rows: SafeIntegrationSetting[] }>({
    action: 'catalog',
    integrationType,
  });
  return result.rows;
}

export async function saveIntegrationSetting(input: {
  id?: string | null;
  integrationType: string;
  label: string;
  isActive: boolean;
  config: Record<string, unknown>;
  clearSecretFields?: string[];
}): Promise<SafeIntegrationSetting> {
  const result = await invoke<{
    success: true;
    row: SafeIntegrationSetting;
    validation?: { status: IntegrationValidationStatus; message?: string };
  }>({
    action: 'upsert',
    ...input,
  });
  const acceptedActiveStatuses = new Set<IntegrationValidationStatus>([
    'validated',
    'validated_restricted',
    'partially_validated',
    'oauth_pending',
  ]);
  if (input.isActive && (!result.validation || !acceptedActiveStatuses.has(result.validation.status))) {
    throw new Error('O servidor não confirmou a validação; nada deve ser considerado pronto para uso.');
  }
  return { ...result.row, validation: result.validation };
}

export async function deleteIntegrationSetting(id: string, integrationType: string): Promise<void> {
  await invoke<{ success: true }>({ action: 'delete', id, integrationType });
}

type EvolutionCredentials = {
  id?: string | null;
  apiUrl?: string;
  apiKey?: string;
};

export async function fetchEvolutionInstances(input: EvolutionCredentials): Promise<string[]> {
  const result = await invoke<{ success: true; instances: string[] }>({
    action: 'evolution-instances',
    integrationType: 'evolution_api',
    ...input,
  });
  return result.instances;
}

export async function testEvolutionInstance(
  input: EvolutionCredentials & { instanceName: string },
): Promise<{ connected: boolean; state: string }> {
  const result = await invoke<{ success: true; connected: boolean; state: string }>({
    action: 'evolution-test',
    integrationType: 'evolution_api',
    ...input,
  });
  return { connected: result.connected, state: result.state };
}
