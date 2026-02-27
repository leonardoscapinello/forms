/**
 * Email format validation with TLD/gTLD checking.
 * Validates structure, domain, and top-level domain against known valid TLDs.
 */

// Common valid TLDs and gTLDs (covers 99%+ of real email traffic)
const VALID_TLDS = new Set([
  // Generic TLDs
  'com', 'org', 'net', 'edu', 'gov', 'mil', 'int',
  // Popular gTLDs
  'io', 'co', 'app', 'dev', 'ai', 'me', 'info', 'biz', 'name', 'pro',
  'online', 'site', 'store', 'tech', 'xyz', 'club', 'life', 'live',
  'world', 'cloud', 'digital', 'email', 'global', 'group', 'media',
  'network', 'solutions', 'studio', 'agency', 'design', 'marketing',
  'consulting', 'services', 'systems', 'academy', 'center', 'company',
  'institute', 'foundation', 'partners', 'ventures', 'capital',
  'finance', 'money', 'bank', 'insurance', 'healthcare', 'health',
  'legal', 'law', 'engineering', 'science', 'education', 'training',
  'school', 'university', 'college', 'courses',
  'shop', 'market', 'deals', 'sale', 'buy', 'auction',
  'travel', 'flights', 'hotel', 'holiday', 'tours', 'voyage',
  'food', 'restaurant', 'pizza', 'coffee', 'bar', 'pub',
  'blog', 'news', 'press', 'report', 'review', 'wiki',
  'photo', 'video', 'music', 'art', 'gallery', 'film',
  'game', 'games', 'play', 'bet', 'casino', 'poker',
  'chat', 'social', 'dating', 'community', 'forum', 'page',
  'space', 'zone', 'land', 'city', 'town', 'earth',
  'work', 'works', 'jobs', 'career', 'team', 'plus',
  'one', 'top', 'best', 'vip', 'guru', 'expert', 'tips',
  'link', 'click', 'host', 'website', 'web', 'domains',
  'fit', 'fitness', 'yoga', 'run', 'bike', 'surf',
  'eco', 'green', 'bio', 'organic', 'garden',
  'casa', 'immo', 'properties', 'estate', 'apartments', 'house',
  'auto', 'car', 'cars', 'moto', 'taxi',
  'mobi', 'mobile', 'phone', 'tel',
  'coop', 'aero', 'museum', 'cat', 'post', 'jobs',
  // Country-code TLDs (ccTLDs)
  'ac', 'ad', 'ae', 'af', 'ag', 'al', 'am', 'ao', 'aq', 'ar', 'as',
  'at', 'au', 'aw', 'ax', 'az', 'ba', 'bb', 'bd', 'be', 'bf', 'bg',
  'bh', 'bi', 'bj', 'bm', 'bn', 'bo', 'br', 'bs', 'bt', 'bw', 'by',
  'bz', 'ca', 'cc', 'cd', 'cf', 'cg', 'ch', 'ci', 'ck', 'cl', 'cm',
  'cn', 'co', 'cr', 'cu', 'cv', 'cw', 'cx', 'cy', 'cz', 'de', 'dj',
  'dk', 'dm', 'do', 'dz', 'ec', 'ee', 'eg', 'er', 'es', 'et', 'eu',
  'fi', 'fj', 'fk', 'fm', 'fo', 'fr', 'ga', 'gb', 'gd', 'ge', 'gf',
  'gg', 'gh', 'gi', 'gl', 'gm', 'gn', 'gp', 'gq', 'gr', 'gs', 'gt',
  'gu', 'gw', 'gy', 'hk', 'hm', 'hn', 'hr', 'ht', 'hu', 'id', 'ie',
  'il', 'im', 'in', 'io', 'iq', 'ir', 'is', 'it', 'je', 'jm', 'jo',
  'jp', 'ke', 'kg', 'kh', 'ki', 'km', 'kn', 'kp', 'kr', 'kw', 'ky',
  'kz', 'la', 'lb', 'lc', 'li', 'lk', 'lr', 'ls', 'lt', 'lu', 'lv',
  'ly', 'ma', 'mc', 'md', 'me', 'mg', 'mh', 'mk', 'ml', 'mm', 'mn',
  'mo', 'mp', 'mq', 'mr', 'ms', 'mt', 'mu', 'mv', 'mw', 'mx', 'my',
  'mz', 'na', 'nc', 'ne', 'nf', 'ng', 'ni', 'nl', 'no', 'np', 'nr',
  'nu', 'nz', 'om', 'pa', 'pe', 'pf', 'pg', 'ph', 'pk', 'pl', 'pm',
  'pn', 'pr', 'ps', 'pt', 'pw', 'py', 'qa', 're', 'ro', 'rs', 'ru',
  'rw', 'sa', 'sb', 'sc', 'sd', 'se', 'sg', 'sh', 'si', 'sj', 'sk',
  'sl', 'sm', 'sn', 'so', 'sr', 'ss', 'st', 'su', 'sv', 'sx', 'sy',
  'sz', 'tc', 'td', 'tf', 'tg', 'th', 'tj', 'tk', 'tl', 'tm', 'tn',
  'to', 'tr', 'tt', 'tv', 'tw', 'tz', 'ua', 'ug', 'uk', 'us', 'uy',
  'uz', 'va', 'vc', 've', 'vg', 'vi', 'vn', 'vu', 'wf', 'ws', 'ye',
  'yt', 'za', 'zm', 'zw',
]);

export interface EmailValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validates email format, structure, and TLD.
 * Does NOT check deliverability (that's the smart validation API).
 */
export function validateEmailFormat(email: string): EmailValidationResult {
  const trimmed = email.trim().toLowerCase();

  if (!trimmed) {
    return { valid: false, error: 'E-mail não pode estar vazio' };
  }

  // Basic structure: must have exactly one @
  const atParts = trimmed.split('@');
  if (atParts.length !== 2) {
    return { valid: false, error: 'Formato de e-mail inválido' };
  }

  const [localPart, domain] = atParts;

  // Local part validation
  if (!localPart || localPart.length > 64) {
    return { valid: false, error: 'Formato de e-mail inválido' };
  }

  // No consecutive dots, no leading/trailing dots
  if (/^\.|\.$|\.\./.test(localPart)) {
    return { valid: false, error: 'Formato de e-mail inválido' };
  }

  // Valid local part characters (RFC 5321 simplified)
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(localPart)) {
    return { valid: false, error: 'E-mail contém caracteres inválidos' };
  }

  // Domain validation
  if (!domain || domain.length > 253) {
    return { valid: false, error: 'Domínio do e-mail inválido' };
  }

  const domainParts = domain.split('.');

  // Must have at least 2 parts (e.g. gmail.com)
  if (domainParts.length < 2) {
    return { valid: false, error: 'Domínio do e-mail inválido' };
  }

  // Each domain label: 1-63 chars, alphanumeric + hyphens, no leading/trailing hyphens
  for (const part of domainParts) {
    if (!part || part.length > 63) {
      return { valid: false, error: 'Domínio do e-mail inválido' };
    }
    if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(part)) {
      return { valid: false, error: 'Domínio do e-mail inválido' };
    }
  }

  // TLD validation — last part must be a known TLD
  const tld = domainParts[domainParts.length - 1];

  if (tld.length < 2) {
    return { valid: false, error: 'Extensão do domínio inválida' };
  }

  // For compound ccTLDs like .com.br, check the last part
  if (!VALID_TLDS.has(tld)) {
    return { valid: false, error: `Extensão ".${tld}" não é reconhecida` };
  }

  return { valid: true };
}
