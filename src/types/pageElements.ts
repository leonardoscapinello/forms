/** Page Element types for the drag-and-drop page builder */

export type PageElementType =
  // Visual elements
  | 'heading'
  | 'text'
  | 'rich_text'
  | 'image'
  | 'button'
  | 'divider'
  | 'video'
  | 'spacer'
  | 'list'
  | 'alert'
  | 'notification'
  | 'chart'
  | 'comparative_chart'
  | 'progress_bar'
  | 'horizontal_bar'
  | 'timer'
  | 'circular_progress'
  | 'loading'
  // Layout elements
  | 'columns'
  // Section elements
  | 'arguments'
  | 'testimonials'
  | 'faq'
  | 'pricing'
  | 'before_after'
  | 'carousel'
  | 'whatsapp_invite'
  // Form input elements
  | 'input_text'
  | 'input_email'
  | 'input_phone'
  | 'input_address'
  | 'input_checkbox'
  | 'input_select'
  | 'input_radio'
  | 'input_rating'
  | 'input_nps'
  | 'input_number'
  | 'input_textarea'
  | 'input_date'
  | 'input_height'
  | 'input_weight'
  | 'input_document'
  | 'input_company'
  // Quiz elements
  | 'input_yes_no'
  | 'input_multi_select'
  | 'input_quiz_icon'
  | 'input_quiz_image'
  // Effects
  | 'confetti'
  // Card element
  | 'card';

export type RatingIconStyle = 'star' | 'heart' | 'thumbsUp' | 'emoji' | 'numeric' | 'nps';
export type LoadingStyle = 'bar' | 'circular' | 'infinite';

export type CardActionType = 'go_to_page' | 'open_modal' | 'copy_text';

export interface CardItem {
  id: string;
  imageUrl?: string;
  title: string;
  description?: string;
  badges?: string[];
  actionType: CardActionType;
  /** Target page ID for 'go_to_page' action */
  actionTargetPageId?: string;
  /** Text content for 'open_modal' action */
  actionModalContent?: string;
  /** Text to copy for 'copy_text' action */
  actionCopyText?: string;
}

/** Keys for company field visibility/editability config */
export type CompanyFieldKey =
  | 'razao_social' | 'nome_fantasia' | 'natureza_juridica' | 'porte'
  | 'abertura' | 'situacao' | 'cnae_principal'
  | 'logradouro' | 'numero' | 'complemento' | 'bairro' | 'municipio' | 'uf' | 'cep'
  | 'telefone' | 'email';

export const COMPANY_FIELD_LABELS: Record<CompanyFieldKey, string> = {
  razao_social: 'Razão Social',
  nome_fantasia: 'Nome Fantasia',
  natureza_juridica: 'Natureza Jurídica',
  porte: 'Porte',
  abertura: 'Data de Abertura',
  situacao: 'Situação',
  cnae_principal: 'CNAE Principal',
  logradouro: 'Logradouro',
  numero: 'Número',
  complemento: 'Complemento',
  bairro: 'Bairro',
  municipio: 'Município',
  uf: 'UF',
  cep: 'CEP',
  telefone: 'Telefone',
  email: 'E-mail',
};

export const ALL_COMPANY_FIELDS: CompanyFieldKey[] = Object.keys(COMPANY_FIELD_LABELS) as CompanyFieldKey[];

/**
 * Compound field sub-keys: element types that store an object value
 * and can be referenced by sub-key (e.g. "elementId.street").
 * Used in conditions, variables, and webhook payloads.
 */
export const COMPOUND_FIELD_SUB_KEYS: Partial<Record<PageElementType, { key: string; label: string }[]>> = {
  input_address: [
    { key: 'country', label: 'País' },
    { key: 'cep', label: 'CEP' },
    { key: 'street', label: 'Rua' },
    { key: 'number', label: 'Número' },
    { key: 'complement', label: 'Complemento' },
    { key: 'neighborhood', label: 'Bairro' },
    { key: 'city', label: 'Cidade' },
    { key: 'state', label: 'Estado' },
  ],
  input_company: [
    { key: 'cnpj', label: 'CNPJ' },
    { key: 'razao_social', label: 'Razão Social' },
    { key: 'nome_fantasia', label: 'Nome Fantasia' },
    { key: 'situacao', label: 'Situação' },
    { key: 'porte', label: 'Porte' },
    { key: 'natureza_juridica', label: 'Natureza Jurídica' },
    { key: 'cnae_principal', label: 'CNAE' },
    { key: 'logradouro', label: 'Logradouro' },
    { key: 'numero', label: 'Número' },
    { key: 'municipio', label: 'Município' },
    { key: 'uf', label: 'UF' },
    { key: 'cep', label: 'CEP' },
    { key: 'telefone', label: 'Telefone' },
    { key: 'email', label: 'E-mail' },
  ],
  input_phone: [
    { key: 'ddi', label: 'DDI' },
    { key: 'number', label: 'Número' },
    { key: 'countryCode', label: 'Código do país' },
  ],
  input_height: [
    { key: 'value', label: 'Valor' },
    { key: 'unit', label: 'Unidade' },
  ],
  input_weight: [
    { key: 'value', label: 'Valor' },
    { key: 'unit', label: 'Unidade' },
  ],
};

export interface PageElementStyle {
  textAlign?: 'left' | 'center' | 'right';
  fontSize?: string;
  fontWeight?: string;
  fontFamily?: string;
  color?: string;
  backgroundColor?: string;
  backgroundOpacity?: number; // 0-100
  padding?: number;
  paddingTop?: number;
  paddingRight?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  margin?: number;
  marginTop?: number;
  marginRight?: number;
  marginBottom?: number;
  marginLeft?: number;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  borderOpacity?: number; // 0-100
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'none';
  boxShadow?: string;
  maxWidth?: string;
  width?: string;
  backdropBlur?: number; // px
}

export interface SelectOption {
  id: string;
  label: string;
  emoji?: string;
  imageUrl?: string;
  /** Score added when this option is selected */
  score?: number;
}

export type ListStyleType = 'bullet' | 'numbered' | 'check' | 'emoji';

export interface ListItem {
  id: string;
  text: string;
  emoji?: string; // used when style is 'emoji'
}

export interface ArgumentItem {
  id: string;
  emoji: string;
  title: string;
  description: string;
}

export interface TestimonialItem {
  id: string;
  name: string;
  socialProfile?: string;
  rating: number;
  text: string;
  photoUrl?: string; // upload or empty for initials
  verified?: boolean; // show verified badge
}

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
}

export interface PricingFeature {
  id: string;
  text: string;
  included: boolean;
}

export interface PricingPlan {
  id: string;
  name: string;
  price: string;
  period?: string;
  description?: string;
  features: PricingFeature[];
  ctaLabel: string;
  highlighted?: boolean;
}

export interface CarouselImage {
  id: string;
  src: string;
  alt?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  text: string;
  icon?: string; // emoji
}

export interface ProgressBarItem {
  id: string;
  label: string;
  value: number; // 0-100
  color: string;
  labelColor?: string;
  valueColor?: string;
  barBackground?: string;
}

/** A single data point inside a comparative dataset */
export interface ComparativeDataPoint {
  id: string;
  label: string;
  value: string;
  /** Per-point color for segments (circular chart, etc.) */
  color?: string;
  /** Tooltip badge text shown above this specific point */
  tooltip?: string;
  /** Custom color for tooltip badge */
  tooltipColor?: string;
}

/** A dataset (series) in a comparative chart */
export interface ComparativeDataset {
  id: string;
  name: string;
  color: string;
  tooltip?: string;
  points: ComparativeDataPoint[];
}

export type ComparativeChartMode = 'cartesian' | 'bar' | 'circular';

export interface ColumnData {
  id: string;
  elements: PageElement[];
}

export interface PageElement {
  id: string;
  type: PageElementType;
  // Content fields
  content?: string;
  description?: string;
  src?: string;
  alt?: string;
  href?: string;
  level?: 1 | 2 | 3 | 4;
  height?: number;
  // Image properties
  imageObjectFit?: 'cover' | 'contain' | 'fill' | 'none';
  imageFocalX?: number; // 0-100 percentage
  imageFocalY?: number; // 0-100 percentage
  imageMaxHeight?: number; // in px
  // Alert variant
  alertVariant?: 'info' | 'success' | 'warning' | 'error';
  // Notification
  notificationItems?: NotificationItem[];
  notificationMode?: 'sequential' | 'random';
  notificationInterval?: number;
  notificationDuration?: number;
  notificationPosition?: 'top' | 'bottom';
  // Chart element
  chartType?: import('@/types/form').ChartType;
  chartItems?: import('@/types/form').GraphicDataItem[];
  chartStyle?: import('@/types/form').ChartStyle;
  // Comparative chart element
  comparativeDatasets?: ComparativeDataset[];
  comparativeMode?: ComparativeChartMode;
  comparativeLabels?: string[]; // X-axis labels shared across datasets
  // Progress bar element
  progressBarItems?: ProgressBarItem[];
  progressBarLayout?: 1 | 2 | 3; // 1, 2 or 3 columns
  progressBarDisposition?: 'chart_legend' | 'legend_chart'; // order
  progressBarBarWidth?: number; // max width of each vertical bar in px (default 120)
  // Progress bar column border (shared across all bars)
  progressBarColBorderWidth?: number;
  progressBarColBorderStyle?: 'solid' | 'dashed' | 'dotted' | 'none';
  progressBarColBorderColor?: string;
  progressBarColBorderRadius?: number;
  // Section elements
  argumentItems?: ArgumentItem[];
  testimonialItems?: TestimonialItem[];
  faqItems?: FAQItem[];
  pricingPlans?: PricingPlan[];
  beforeImage?: string;
  afterImage?: string;
  beforeAfterMode?: 'slider' | 'side_by_side';
  carouselImages?: CarouselImage[];
  // WhatsApp invite element
  waGroupName?: string;
  waGroupPhoto?: string;
  waGroupMessage?: string;
  waGroupLink?: string;
  waButtonLabel?: string;
  waParticipantCount?: number;
  // Horizontal bar element
  horizontalBarLabel?: string;
  horizontalBarValue?: number; // 0-100
  horizontalBarColor?: string;
  horizontalBarBackground?: string;
  horizontalBarLabelColor?: string;
  horizontalBarValueColor?: string;
  horizontalBarHeight?: number; // track height in px
  // Circular progress element
  circularProgressValue?: number; // 0-100
  circularProgressLabelBefore?: string;
  circularProgressLabelAfter?: string;
  circularProgressColor?: string;
  circularProgressTrackColor?: string;
  circularProgressTextColor?: string;
  circularProgressLabelColor?: string;
  circularProgressSize?: number; // diameter in px
  circularProgressStroke?: number; // stroke width
  // Timer / Countdown element
  timerMode?: 'text' | 'time' | 'datetime'; // 3 modes
  timerDurationMinutes?: number; // for 'text' and 'time' modes
  timerTargetDate?: string; // ISO date string for 'datetime' mode
  timerLabel?: string; // text displayed alongside countdown
  timerFinishedLabel?: string; // text when timer reaches 0
  timerShowDays?: boolean;
  timerShowHours?: boolean;
  timerShowMinutes?: boolean;
  timerShowSeconds?: boolean;
  timerDigitColor?: string;
  timerLabelColor?: string;
  timerSeparatorColor?: string;
  timerBoxBackground?: string;
  timerBoxBorderRadius?: number;
  // List element
  listItems?: ListItem[];
  listStyleType?: ListStyleType;
  listIconColor?: string;
  listTextColor?: string;
  listGap?: number; // gap between items in px
  // Form field properties
  label?: string;
  placeholder?: string;
  required?: boolean;
  requiredMessage?: string; // custom "required" error text
  validationMessage?: string; // custom validation error text (e.g. smart email)
  options?: SelectOption[];
  maxRating?: number;
  smartValidation?: boolean;
  defaultCountryCode?: string;
  unit?: string;
  allowUnitToggle?: boolean;
  defaultValue?: any;
  min?: number;
  max?: number;
  dateMode?: 'date' | 'time' | 'datetime';
  dateFormat?: string;
  columnCount?: number;
  columnData?: ColumnData[];
  yesScore?: number;
  noScore?: number;
  buttonAction?: 'none' | 'next' | 'previous' | 'specific' | 'finish';
  buttonTargetPageId?: string;
  // Rating/NPS properties
  ratingStyle?: RatingIconStyle;
  ratingEmoji?: string; // custom emoji when ratingStyle === 'emoji'
  ratingActiveColor?: string;
  ratingInactiveColor?: string;
  npsLowLabel?: string;
  npsHighLabel?: string;
  /** Per-score colors — array indexed by score value (0..maxRating). Falls back to band defaults. */
  npsScoreColors?: string[];
  /** Per-score labels — array indexed by score value (0..maxRating). Shown on mobile when selected. */
  npsScoreLabels?: string[];
  npsDragHint?: string;
  // Loading element properties
  loadingStyle?: LoadingStyle;
  loadingDuration?: number;
  loadingTargetPercent?: number;
  loadingAction?: 'none' | 'next' | 'specific' | 'finish';
  loadingTargetPageId?: string;
  loadingLabel?: string;
  loadingColor?: string;
  loadingTrackColor?: string;
  loadingTextColor?: string;
  loadingSize?: number;
  loadingStroke?: number;
  /** Variable ID that this field's answer should be stored into */
  variableId?: string;
  /**
   * Semantic identifier for this field in webhook payloads and integrations.
   * e.g. "email", "phone", "full_name". Falls back to element.id if not set.
   */
  fieldName?: string;
  /** Document field: allowed document types */
  documentAllowedTypes?: ('cpf' | 'cnpj' | 'passport')[];
  /** Company field: which fields to show in UI (all data is still submitted) */
  companyVisibleFields?: CompanyFieldKey[];
  /** Company field: which fields the user can manually edit */
  companyEditableFields?: CompanyFieldKey[];
  // Card element
  cardItems?: CardItem[];
  cardColumns?: 1 | 2 | 3;
  cardImageHeight?: number; // px
  // Confetti element
  confettiDirection?: 'top' | 'sides';
  confettiIntensity?: 'subtle' | 'explosion';
  confettiDuration?: number; // ms
  confettiColors?: string[];
  style?: PageElementStyle;
}

export interface PageConfig {
  elements: PageElement[];
  backgroundColor?: string;
  backgroundImage?: string;
  maxWidth?: string;
}

export const PAGE_ELEMENT_LABELS: Record<PageElementType, string> = {
  heading: 'Título',
  text: 'Texto',
  rich_text: 'Parágrafo',
  image: 'Imagem',
  button: 'Botão',
  divider: 'Divisor',
  video: 'Vídeo',
  spacer: 'Espaço',
  list: 'Lista',
  alert: 'Atenção',
  notification: 'Notificação',
  chart: 'Gráfico',
  comparative_chart: 'Gráfico comparativo',
  progress_bar: 'Barra de progresso',
  horizontal_bar: 'Barra horizontal',
  timer: 'Timer',
  circular_progress: 'Progresso circular',
  loading: 'Loading',
  columns: 'Colunas',
  arguments: 'Argumentos',
  testimonials: 'Depoimentos',
  faq: 'FAQ',
  pricing: 'Preços',
  before_after: 'Antes e Depois',
  carousel: 'Carrossel',
  whatsapp_invite: 'Convite WhatsApp',
  input_text: 'Campo',
  input_email: 'E-mail',
  input_phone: 'Telefone',
  input_address: 'Endereço',
  input_checkbox: 'Checkbox',
  input_select: 'Seleção',
  input_radio: 'Radio',
  input_rating: 'Avaliação',
  input_nps: 'NPS',
  input_number: 'Número',
  input_textarea: 'Textarea',
  input_date: 'Data',
  input_height: 'Altura',
  input_weight: 'Peso',
  input_yes_no: 'Sim/Não',
  input_multi_select: 'Múltipla escolha',
  input_quiz_icon: 'Quiz com ícone',
  input_quiz_image: 'Quiz com imagem',
  input_document: 'Documento',
  input_company: 'Empresa',
  confetti: 'Confete',
  card: 'Cards',
};

export type ElementCategory = 'layout' | 'content' | 'fields_text' | 'fields_choice' | 'data' | 'effects' | 'sections';

export const ELEMENT_CATEGORIES: Record<ElementCategory, { label: string; types: PageElementType[] }> = {
  layout: {
    label: 'Layout',
    types: ['columns', 'spacer', 'divider'],
  },
  fields_text: {
    label: 'Campos de entrada',
    types: ['input_text', 'input_email', 'input_phone', 'input_number', 'input_textarea', 'input_date', 'input_address', 'input_document', 'input_company', 'input_height', 'input_weight'],
  },
  fields_choice: {
    label: 'Campos de escolha',
    types: ['input_checkbox', 'input_select', 'input_radio', 'input_rating', 'input_nps', 'input_yes_no', 'input_multi_select', 'input_quiz_icon', 'input_quiz_image'],
  },
  content: {
    label: 'Conteúdo',
    types: ['heading', 'rich_text', 'text', 'image', 'video', 'button', 'list', 'alert'],
  },
  data: {
    label: 'Dados e métricas',
    types: ['chart', 'comparative_chart', 'progress_bar', 'horizontal_bar', 'circular_progress'],
  },
  effects: {
    label: 'Animações e efeitos',
    types: ['confetti', 'notification', 'loading', 'timer'],
  },
  sections: {
    label: 'Seções prontas',
    types: ['arguments', 'testimonials', 'faq', 'pricing', 'before_after', 'carousel', 'whatsapp_invite'],
  },
};

export function createDefaultPageElement(type: PageElementType): PageElement {
  const shortId = crypto.randomUUID().slice(0, 6);
  const base: PageElement = {
    id: crypto.randomUUID(),
    type,
    style: { textAlign: 'left' },
    fieldName: type.startsWith('input_') ? `${type.replace('input_', '')}_${shortId}` : undefined,
  };

  switch (type) {
    case 'heading':
      base.content = 'Seu título aqui';
      base.level = 2;
      base.style = { textAlign: 'center', fontSize: '2xl', fontWeight: 'bold' };
      break;
    case 'text':
      base.content = 'Escreva seu texto aqui...';
      base.style = { fontSize: 'base' };
      break;
    case 'rich_text':
      base.content = '<p>Escreva seu parágrafo aqui...</p>';
      base.style = { fontSize: 'base' };
      break;
    case 'image':
      base.src = '';
      base.alt = 'Imagem';
      break;
    case 'button':
      base.content = 'Continuar';
      base.href = '';
      base.style = { textAlign: 'center', width: '100%', padding: 16, borderRadius: 8 };
      break;
    case 'divider':
      base.height = 1;
      break;
    case 'video':
      base.src = '';
      break;
    case 'spacer':
      base.height = 40;
      break;
    case 'list':
      base.listStyleType = 'bullet';
      base.listItems = [
        { id: crypto.randomUUID(), text: 'Primeiro item da lista' },
        { id: crypto.randomUUID(), text: 'Segundo item da lista' },
        { id: crypto.randomUUID(), text: 'Terceiro item da lista' },
      ];
      base.listIconColor = '#22c55e';
      base.listTextColor = '#1a1a1a';
      base.listGap = 8;
      base.style = { fontSize: 'base' };
      break;
    case 'alert':
      base.content = 'Esta é uma mensagem importante.';
      base.alertVariant = 'info';
      break;
    case 'notification':
      base.notificationItems = [
        { id: crypto.randomUUID(), title: 'Novo pedido', text: 'João acabou de fazer um pedido', icon: '🛒' },
        { id: crypto.randomUUID(), title: 'Avaliação', text: 'Maria deixou uma avaliação ⭐⭐⭐⭐⭐', icon: '⭐' },
        { id: crypto.randomUUID(), title: 'Bem-vindo!', text: 'Lucas se cadastrou agora', icon: '👋' },
      ];
      base.notificationMode = 'sequential';
      base.notificationInterval = 4;
      break;
    case 'arguments':
      base.argumentItems = [
        { id: crypto.randomUUID(), emoji: '🎯', title: 'Benefício 1', description: 'Descreva o primeiro benefício aqui.' },
        { id: crypto.randomUUID(), emoji: '🚀', title: 'Benefício 2', description: 'Descreva o segundo benefício aqui.' },
        { id: crypto.randomUUID(), emoji: '💡', title: 'Benefício 3', description: 'Descreva o terceiro benefício aqui.' },
      ];
      break;
    case 'testimonials':
      base.testimonialItems = [
        { id: crypto.randomUUID(), name: 'Maria Silva', rating: 5, text: 'Excelente produto! Recomendo a todos.', photoUrl: '' },
        { id: crypto.randomUUID(), name: 'João Santos', rating: 5, text: 'Mudou minha vida. Resultados incríveis!', photoUrl: '' },
      ];
      break;
    case 'faq':
      base.faqItems = [
        { id: crypto.randomUUID(), question: 'Como funciona?', answer: 'É simples e fácil de usar.' },
        { id: crypto.randomUUID(), question: 'Tem garantia?', answer: 'Sim, 30 dias de garantia incondicional.' },
      ];
      break;
    case 'pricing':
      base.pricingPlans = [
        {
          id: crypto.randomUUID(), name: 'Básico', price: 'R$ 49', period: '/mês',
          features: [
            { id: crypto.randomUUID(), text: 'Recurso 1', included: true },
            { id: crypto.randomUUID(), text: 'Recurso 2', included: true },
            { id: crypto.randomUUID(), text: 'Recurso 3', included: false },
          ],
          ctaLabel: 'Escolher', highlighted: false,
        },
        {
          id: crypto.randomUUID(), name: 'Pro', price: 'R$ 99', period: '/mês',
          features: [
            { id: crypto.randomUUID(), text: 'Recurso 1', included: true },
            { id: crypto.randomUUID(), text: 'Recurso 2', included: true },
            { id: crypto.randomUUID(), text: 'Recurso 3', included: true },
          ],
          ctaLabel: 'Escolher', highlighted: true,
        },
      ];
      break;
    case 'before_after':
      base.beforeImage = '';
      base.afterImage = '';
      base.beforeAfterMode = 'slider';
      break;
    case 'carousel':
      base.carouselImages = [];
      break;
    case 'columns':
      base.columnCount = 2;
      base.columnData = [
        { id: crypto.randomUUID(), elements: [] },
        { id: crypto.randomUUID(), elements: [] },
      ];
      break;
    case 'chart':
      base.chartType = 'column';
      base.chartItems = [
        { id: crypto.randomUUID(), label: 'Jan', value: '65', color: '#6366f1' },
        { id: crypto.randomUUID(), label: 'Fev', value: '80', color: '#3b82f6' },
        { id: crypto.randomUUID(), label: 'Mar', value: '45', color: '#06b6d4' },
        { id: crypto.randomUUID(), label: 'Abr', value: '90', color: '#10b981' },
      ];
      base.chartStyle = { showGrid: true, showLabels: true, showLegend: true, showValues: true, animated: true };
      break;
    case 'comparative_chart': {
      const labels = ['Ontem', 'Hoje', 'Amanhã'];
      base.comparativeMode = 'cartesian';
      base.comparativeLabels = labels;
      base.comparativeDatasets = [
        {
          id: crypto.randomUUID(),
          name: 'Você',
          color: '#22c55e',
          points: [
            { id: crypto.randomUUID(), label: 'Ontem', value: '10', color: '#ef4444' },
            { id: crypto.randomUUID(), label: 'Hoje', value: '40', color: '#f59e0b', tooltip: 'Você' },
            { id: crypto.randomUUID(), label: 'Amanhã', value: '80', color: '#22c55e' },
          ],
        },
        {
          id: crypto.randomUUID(),
          name: 'Concorrente',
          color: '#ef4444',
          points: [
            { id: crypto.randomUUID(), label: 'Ontem', value: '5', color: '#9ca3af' },
            { id: crypto.randomUUID(), label: 'Hoje', value: '60', color: '#6b7280' },
            { id: crypto.randomUUID(), label: 'Amanhã', value: '90', color: '#4b5563', tooltip: 'Concorrente' },
          ],
        },
      ];
      base.chartStyle = { showGrid: true, showLabels: true, showLegend: true, showValues: true, animated: true };
      break;
    }
    case 'progress_bar':
      base.progressBarItems = [
        { id: crypto.randomUUID(), label: 'Onde você está hoje.', value: 10, color: '#EF4444', barBackground: '#fecaca', valueColor: '#991b1b', labelColor: '#1a1a1a' },
        { id: crypto.randomUUID(), label: 'Onde Você Vai Estar em 30 Dias:', value: 100, color: '#23C55E', barBackground: '#bbf7d0', valueColor: '#14532d', labelColor: '#1a1a1a' },
        { id: crypto.randomUUID(), label: 'Resultado Esperado:', value: 75, color: '#FACC16', barBackground: '#fef9c3', valueColor: '#854d0e', labelColor: '#1a1a1a' },
      ];
      base.progressBarLayout = 2;
      base.progressBarDisposition = 'chart_legend';
      base.style = { ...base.style };
      break;
    case 'horizontal_bar':
      base.horizontalBarLabel = 'Progresso';
      base.horizontalBarValue = 65;
      base.horizontalBarColor = '#6366f1';
      base.horizontalBarBackground = '#e5e7eb';
      base.horizontalBarHeight = 12;
      break;
    case 'circular_progress':
      base.circularProgressValue = 72;
      base.circularProgressLabelBefore = 'Seu progresso';
      base.circularProgressLabelAfter = 'concluído';
      base.circularProgressColor = '#22c55e';
      base.circularProgressTrackColor = '#e5e7eb';
      base.circularProgressTextColor = '#1a1a1a';
      base.circularProgressLabelColor = '#6b7280';
      base.circularProgressSize = 160;
      base.circularProgressStroke = 14;
      break;
    case 'timer':
      base.timerMode = 'time';
      base.timerDurationMinutes = 10;
      base.timerLabel = 'Oferta expira em:';
      base.timerFinishedLabel = 'Tempo esgotado!';
      base.timerShowDays = false;
      base.timerShowHours = true;
      base.timerShowMinutes = true;
      base.timerShowSeconds = true;
      base.timerDigitColor = '#ffffff';
      base.timerLabelColor = '#1a1a1a';
      base.timerSeparatorColor = '#1a1a1a';
      base.timerBoxBackground = '#EF4444';
      base.timerBoxBorderRadius = 8;
      break;
    case 'loading':
      base.loadingStyle = 'bar';
      base.loadingDuration = 5;
      base.loadingTargetPercent = 100;
      base.loadingAction = 'next';
      base.loadingLabel = 'Carregando...';
      base.loadingColor = '#6366f1';
      base.loadingTrackColor = '#e5e7eb';
      base.loadingTextColor = '#1a1a1a';
      base.loadingSize = 120;
      base.loadingStroke = 10;
      break;
    case 'input_text':
      base.label = 'Nome';
      base.placeholder = 'Digite seu nome';
      base.required = false;
      break;
    case 'input_email':
      base.label = 'Email';
      base.placeholder = 'seu@email.com';
      base.required = false;
      break;
    case 'input_phone':
      base.label = 'Telefone';
      base.placeholder = '(00) 00000-0000';
      base.required = false;
      base.defaultCountryCode = 'BR';
      break;
    case 'input_address':
      base.label = 'Endereço';
      base.placeholder = 'Rua, número, cidade...';
      base.required = false;
      break;
    case 'input_checkbox':
      base.label = 'Aceito os termos';
      base.required = false;
      break;
    case 'input_select':
      base.label = 'Selecione uma opção';
      base.placeholder = 'Escolha...';
      base.options = [
        { id: crypto.randomUUID(), label: 'Opção 1' },
        { id: crypto.randomUUID(), label: 'Opção 2' },
        { id: crypto.randomUUID(), label: 'Opção 3' },
      ];
      break;
    case 'input_radio':
      base.label = 'Escolha uma opção';
      base.options = [
        { id: crypto.randomUUID(), label: 'Opção A' },
        { id: crypto.randomUUID(), label: 'Opção B' },
        { id: crypto.randomUUID(), label: 'Opção C' },
      ];
      break;
    case 'input_rating':
      base.label = 'Avaliação';
      base.maxRating = 5;
      base.ratingStyle = 'star';
      base.ratingActiveColor = '#facc15';
      base.ratingInactiveColor = '#d1d5db';
      break;
    case 'input_nps':
      base.label = 'Em uma escala de 0 a 10, o quanto você recomendaria?';
      base.maxRating = 10;
      base.ratingStyle = 'nps';
      base.npsLowLabel = 'Nada provável';
      base.npsHighLabel = 'Muito provável';
      break;
    case 'input_number':
      base.label = 'Número';
      base.placeholder = '0';
      base.required = false;
      break;
    case 'input_textarea':
      base.label = 'Mensagem';
      base.placeholder = 'Digite sua mensagem...';
      base.required = false;
      break;
    case 'input_date':
      base.label = 'Data';
      base.placeholder = 'dd/mm/aaaa';
      base.required = false;
      base.dateMode = 'date';
      base.dateFormat = 'dd/MM/yyyy';
      break;
    case 'input_height':
      base.label = 'Qual sua altura?';
      base.unit = 'cm';
      base.allowUnitToggle = true;
      base.min = 100;
      base.max = 250;
      base.defaultValue = 170;
      base.required = false;
      break;
    case 'input_weight':
      base.label = 'Qual seu peso?';
      base.unit = 'kg';
      base.allowUnitToggle = true;
      base.min = 20;
      base.max = 250;
      base.defaultValue = 70;
      base.required = false;
      break;
    case 'input_yes_no':
      base.label = 'Você concorda?';
      base.required = false;
      break;
    case 'input_multi_select':
      base.label = 'Selecione todas que se aplicam';
      base.options = [
        { id: crypto.randomUUID(), label: 'Opção 1' },
        { id: crypto.randomUUID(), label: 'Opção 2' },
        { id: crypto.randomUUID(), label: 'Opção 3' },
      ];
      base.required = false;
      break;
    case 'input_quiz_icon':
      base.label = 'Qual sua preferência?';
      base.options = [
        { id: crypto.randomUUID(), label: 'Opção 1', emoji: '🎯' },
        { id: crypto.randomUUID(), label: 'Opção 2', emoji: '🚀' },
        { id: crypto.randomUUID(), label: 'Opção 3', emoji: '💡' },
      ];
      base.required = false;
      break;
    case 'input_quiz_image':
      base.label = 'Qual você prefere?';
      base.options = [
        { id: crypto.randomUUID(), label: 'Opção 1', imageUrl: '' },
        { id: crypto.randomUUID(), label: 'Opção 2', imageUrl: '' },
      ];
      base.required = false;
      break;
    case 'input_document':
      base.label = 'Informe seu documento';
      base.documentAllowedTypes = ['cpf', 'cnpj', 'passport'];
      base.required = false;
      break;
    case 'input_company':
      base.label = 'Dados da empresa';
      base.required = false;
      break;
    case 'whatsapp_invite':
      base.waGroupName = 'Comunidade VIP';
      base.waGroupPhoto = '';
      base.waGroupMessage = 'Toque no botão abaixo para entrar no grupo';
      base.waGroupLink = 'https://chat.whatsapp.com/';
      base.waButtonLabel = 'Entrar no grupo';
      base.waParticipantCount = 128;
      break;
    case 'confetti':
      base.confettiDirection = 'top';
      base.confettiIntensity = 'explosion';
      base.confettiDuration = 3000;
      break;
  }

  return base;
}
