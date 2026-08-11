export function signInErrorMessage(code?: string, fallback?: string): string {
  switch (code) {
    case 'invalid_credentials':
      return 'E-mail ou senha inválidos.';
    case 'email_not_confirmed':
      return 'Confirme seu e-mail antes de entrar.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Muitas tentativas em pouco tempo. Aguarde um instante e tente novamente.';
    case 'user_banned':
      return 'Esta conta está temporariamente indisponível. Fale com um administrador.';
    default:
      return fallback ? 'Não foi possível entrar. Verifique os dados e tente novamente.' : 'Não foi possível entrar agora. Tente novamente.';
  }
}
