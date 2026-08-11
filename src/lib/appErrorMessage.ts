import { isChunkLoadError } from './chunkRecovery';

const GENERIC_MESSAGE = 'Não foi possível carregar esta tela. Recarregue para tentar novamente.';
const UPDATE_MESSAGE = 'O sistema foi atualizado. Recarregue para usar a versão mais recente.';

export function appErrorMessage(error: Error, production = import.meta.env.PROD): string {
  if (!production) return error.message || GENERIC_MESSAGE;
  return isChunkLoadError(error) ? UPDATE_MESSAGE : GENERIC_MESSAGE;
}
