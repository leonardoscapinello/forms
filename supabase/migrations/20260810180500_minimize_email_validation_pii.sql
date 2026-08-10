-- Old validation cache rows stored full email addresses and raw provider
-- payloads. They are disposable cache data, so clear them before switching to
-- SHA-256 lookup keys in verify-email.
DELETE FROM public.email_validations;

COMMENT ON COLUMN public.email_validations.email IS
  'SHA-256 of the normalized email address; never store the plaintext address';
