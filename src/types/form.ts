export type QuestionType =
  // Contact Info
  | 'contact_info'
  | 'email'
  | 'phone'
  | 'address'
  | 'website'
  // Text & Video
  | 'short_text'
  | 'long_text'
  // Choice
  | 'multiple_choice'
  | 'single_choice'
  | 'dropdown'
  | 'yes_no'
  | 'legal'
  | 'checkbox'
  // Rating & Ranking
  | 'nps'
  | 'opinion_scale'
  | 'rating'
  | 'ranking'
  // Other
  | 'number'
  | 'date'
  | 'file_upload'
  | 'statement'
  | 'graphic'
  | 'welcome_screen'
  // Ending
  | 'end_screen'
  | 'redirect_url'
  // Integration
  | 'webhook';

export type QuestionCategory =
  | 'contact_info'
  | 'text'
  | 'choice'
  | 'rating_ranking'
  | 'other'
  | 'ending'
  | 'integration';

export interface QuestionOption {
  id: string;
  label: string;
  imageUrl?: string;
  /** For per-option routing: the node ID this option should navigate to */
  nextNodeId?: string;
}

/** How a choice question routes to the next step */
export type RoutingMode = 'all_next' | 'per_option';

export interface InputMask {
  type: 'none' | 'cpf' | 'cnpj' | 'cep' | 'phone' | 'currency' | 'custom';
  pattern?: string; // for custom masks
}

// Graphic field types
export type GraphicVariant = 'chart' | 'timeline' | 'steps' | 'kpis';
export type ChartType = 'bar' | 'column' | 'pie' | 'line' | 'thermometer' | 'speedometer' | 'radar' | 'funnel' | 'area' | 'waterfall' | 'treemap' | 'radialBar';

export interface GraphicDataItem {
  id: string;
  label: string;
  value: string;
  description?: string;
  color?: string;
  /** Second color for gradient fill */
  gradientTo?: string;
  /** 'solid' or 'gradient' */
  colorMode?: 'solid' | 'gradient';
  icon?: string;
  suffix?: string;
  /** Always-visible tooltip text shown in legend */
  tooltip?: string;
}

export interface ChartBoxStyle {
  padding?: number;       // px, default 24
  margin?: number;        // px, default 0
  borderWidth?: number;   // px, default 1
  borderRadius?: number;  // px, default 16
  borderColor?: string;   // hex, default border token
  backgroundColor?: string; // hex, default card token
}

export interface ChartStyle {
  showGrid?: boolean;
  showLabels?: boolean;
  showLegend?: boolean;
  showValues?: boolean;
  animated?: boolean;
  innerRadius?: number; // for donut (0-80)
  colorScheme?: string; // preset name
  box?: ChartBoxStyle;
}

/** A single chart panel inside a graphic block (for multi-chart grids) */
export interface ChartPanel {
  id: string;
  label?: string;            // optional title above the chart
  chartType: ChartType;
  items: GraphicDataItem[];
  style: ChartStyle;
}

/** Grid layout for multi-chart blocks */
export type GridColumns = 1 | 2 | 3;

export interface ValidationRule {
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  regex?: string;
  customError?: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  title: string;
  description?: string;
  placeholder?: string;
  required: boolean;
  options?: QuestionOption[];
  maxRating?: number;
  // Routing
  routingMode?: RoutingMode;
  // Advanced config
  mask?: InputMask;
  validation?: ValidationRule;
  // For redirect
  redirectUrl?: string;
  // For statement / welcome / end
  buttonText?: string;
  // For graphic (display-only)
  emoji?: string;
  graphicVariant?: GraphicVariant;
  graphicChartType?: ChartType;
  graphicData?: GraphicDataItem[];
  chartStyle?: ChartStyle;
  // Multi-chart grid support
  chartPanels?: ChartPanel[];
  gridColumns?: GridColumns;
  // For opinion scale / NPS
  scaleMin?: number;
  scaleMax?: number;
  labelMin?: string;
  labelMax?: string;
  // For file upload
  allowedFileTypes?: string[];
  maxFileSize?: number; // MB
  // For webhook
  webhookUrl?: string;
  webhookMethod?: 'GET' | 'POST' | 'PUT';
  // Page builder elements (when using page builder mode)
  pageElements?: import('./pageElements').PageElement[];
}

export type BackgroundType = 'solid' | 'gradient' | 'image';

export interface FormStyle {
  primaryColor: string;
  backgroundColor: string;
  fontFamily: string;
  /** Background type: solid color, gradient, or image */
  backgroundType?: BackgroundType;
  /** CSS gradient string (e.g. "linear-gradient(135deg, #fff, #000)") */
  backgroundGradient?: string;
  /** Background image URL */
  backgroundImage?: string;
  /** Background image size: cover, contain, auto */
  backgroundSize?: string;
  /** Text color (hex) applied globally to form content */
  textColor?: string;
  /** Heading font family */
  headingFontFamily?: string;
  /** Body/paragraph font family */
  bodyFontFamily?: string;
  /** Company logo URL displayed in top-left corner */
  logoUrl?: string;
  /** Logo max height in px */
  logoHeight?: number;

  // ── Question number styling ──
  questionNumberColor?: string;
  questionNumberSize?: number;      // px
  questionNumberWeight?: string;    // normal, bold, etc
  questionNumberStyle?: 'decimal' | 'circle' | 'none';

  // ── Question title styling ──
  questionTitleColor?: string;
  questionTitleSize?: number;       // px
  questionTitleWeight?: string;

  // ── Question description styling ──
  questionDescColor?: string;
  questionDescSize?: number;        // px
  questionDescWeight?: string;

  // ── Field / input styling ──
  fieldBgColor?: string;
  fieldBorderColor?: string;
  fieldBorderWidth?: number;        // px
  fieldBorderRadius?: number;       // px
  fieldTextColor?: string;
  fieldPlaceholderColor?: string;
  fieldFocusBorderColor?: string;
  fieldHeight?: number;             // px

  // ── Button styling ──
  buttonBgColor?: string;
  buttonTextColor?: string;
  buttonBorderRadius?: number;      // px
  buttonSize?: 'sm' | 'md' | 'lg';

  // ── Back button styling ──
  backButtonBgColor?: string;
  backButtonTextColor?: string;
  backButtonBorderRadius?: number;  // px
  backButtonBorderColor?: string;
  backButtonBorderWidth?: number;
}

export interface NodePosition {
  id: string; // matches question id or 'start'/'add'
  x: number;
  y: number;
}

export type ConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'greater_than'
  | 'less_than'
  | 'is_empty'
  | 'is_not_empty';

export type LogicOperator = 'and' | 'or';

/** A single rule: "question/variable/webhook/context/param X operator value" */
export interface ConditionRule {
  id: string;
  /** 'question' = compare a form question answer; 'variable' = compare a form variable value; 'webhook_response' = compare a webhook response field; 'context' = session context factor; 'param' = GET parameter */
  subjectType?: 'question' | 'variable' | 'webhook_response' | 'context' | 'param';
  questionId: string;
  /** When subjectType === 'variable': the variable ID to compare */
  variableId?: string;
  /** When subjectType === 'webhook_response': the integration node ID */
  webhookNodeId?: string;
  /** When subjectType === 'webhook_response': the dot-notation path in the response */
  webhookResponsePath?: string;
  /** When subjectType === 'context': the context key (e.g. 'device', 'browser') */
  contextKey?: string;
  /** When subjectType === 'param': the GET parameter name */
  paramKey?: string;
  operator: ConditionOperator;
  value: string;
  /** How this rule connects to the previous item (ignored for the first rule) */
  logicWithPrev?: LogicOperator;
}

/** A group of rules combined by AND or OR, which can nest other groups */
export interface ConditionGroup {
  id: string;
  logic: LogicOperator;
  rules: ConditionRule[];
  groups: ConditionGroup[]; // nested sub-groups
}

export interface ConditionBranch {
  id: string;
  label: string;
  /** @deprecated — kept for backward compat, use conditionGroup instead */
  questionId?: string;
  /** @deprecated */
  operator?: ConditionOperator;
  /** @deprecated */
  value?: string;
  conditionGroup: ConditionGroup;
}

export interface ConditionNodeData {
  id: string;
  label: string;
  branches: ConditionBranch[];
}

export type VariableOpType = 'set' | 'add' | 'subtract' | 'multiply' | 'divide';

export type VariableOperandType = 'literal' | 'field';

export interface VariableOperation {
  id: string;
  variableId: string;
  op: VariableOpType;
  /** 'literal' = typed value or {{var}}; 'field' = read from a page field answer */
  operandType?: VariableOperandType;
  /** When operandType === 'field': the page element ID to read the answer from */
  operandFieldId?: string;
  /** Value operand — literal string/number or {{var}} reference */
  operand: string;
}

export interface VariableOpNodeData {
  id: string;
  label: string;
  operations: VariableOperation[];
}

// ── Integration Nodes ────────────────────────────────────────────────────────

export type IntegrationPlatform = 'webhook';

/** Platforms for pixel / analytics tracking */
export type AnalyticsPlatform = 'meta_pixel' | 'google_analytics' | 'tiktok_pixel' | 'linkedin_pixel';

export type PixelEventType =
  | 'Lead'
  | 'Purchase'
  | 'ViewContent'
  | 'CompleteRegistration'
  | 'InitiateCheckout'
  | 'AddToCart'
  | 'Search'
  | 'Contact'
  | 'SubmitApplication'
  | 'custom';

/** Extra key/value param for webhook headers, query params, or body */
export interface WebhookParam {
  id: string;
  key: string;
  value: string;
}

/** Maps a JSON path in the webhook response body to a form variable */
export interface WebhookResponseMapping {
  id: string;
  /** Dot-notation or bracket path in the response JSON. E.g. "data.user.id", "token", "items[0].id", "results[1].name" */
  responsePath: string;
  /** The form variable ID to store the value into */
  variableId: string;
}

export interface IntegrationNodeData {
  id: string;
  platform: IntegrationPlatform; // always 'webhook'
  /** Destination URL (required) */
  webhookUrl?: string;
  /** HTTP method */
  webhookMethod?: 'GET' | 'POST' | 'PUT' | 'PATCH';
  /** @deprecated — use webhookHeaders/webhookQueryParams/webhookBodyParams instead */
  webhookParams?: WebhookParam[];
  /** Custom HTTP headers */
  webhookHeaders?: WebhookParam[];
  /** Query string parameters appended to the URL */
  webhookQueryParams?: WebhookParam[];
  /** Extra key/value pairs merged into the JSON body */
  webhookBodyParams?: WebhookParam[];
  /** Map response fields back to form variables */
  responseMappings?: WebhookResponseMapping[];
  /** Persisted: flattened dot-notation paths from the last successful test */
  responseFields?: string[];
  /** Persisted: sample response body from the last successful test (for previews) */
  lastTestResponse?: any;
  /** If true (default), skip firing if already fired in this session */
  fireOnce?: boolean;
}

/** Mapping of lead data fields to specific form element IDs */
export interface UserDataMapping {
  /** Element ID for the email field (auto-detected if not set) */
  emailElementId?: string;
  /** Element ID for the phone field (auto-detected if not set) */
  phoneElementId?: string;
  /** Element ID for the name/first_name field */
  nameElementId?: string;
}

/** A single platform config inside an analytics node */
export interface AnalyticsPlatformEntry {
  id: string;
  platform: AnalyticsPlatform;
  eventType: PixelEventType | 'PageView';
  customEventName?: string;
  /** Extra key/value params sent in server-side API payload */
  customParams?: { id: string; key: string; value: string }[];
  enabled: boolean;
  /** Map lead data fields to specific form elements */
  userDataMapping?: UserDataMapping;
}

/** Analytics / Pixel node — supports multiple platforms simultaneously */
export interface AnalyticsNodeData {
  id: string;
  /** @deprecated — kept for backward compat with single-platform nodes */
  platform?: AnalyticsPlatform;
  /** @deprecated */
  eventType?: PixelEventType;
  /** @deprecated */
  customEventName?: string;
  /** New: one entry per platform (all enabled ones fire together) */
  platforms?: AnalyticsPlatformEntry[];
  /** If true (default), skip firing if already fired in this session */
  fireOnce?: boolean;
}

// ── WhatsApp (Evolution API) Node ────────────────────────────────────────────

export type WhatsAppMediaType = 'image' | 'document' | 'video' | 'audio';

export interface WhatsAppNodeData {
  id: string;
  /** ID of the integration_settings row for the Evolution API instance */
  instanceId?: string;
  /** Recipient phone number — may contain {{var}} interpolation */
  recipientNumber?: string;
  /** Message text — may contain {{var}} interpolation */
  messageText?: string;
  /** Whether to send media along with the message */
  sendMedia?: boolean;
  /** Media type when sendMedia is true */
  mediaType?: WhatsAppMediaType;
  /** URL of the media to send — may contain {{var}} */
  mediaUrl?: string;
  /** Filename for document media type */
  mediaFileName?: string;
  /** If true (default), skip firing if already fired in this session */
  fireOnce?: boolean;
}

// ── Email (Resend) Node ─────────────────────────────────────────────────────

export interface EmailNodeData {
  id: string;
  instanceId?: string;
  fromEmail?: string;
  fromName?: string;
  toEmail?: string;
  subject?: string;
  bodyText?: string;
  useHtml?: boolean;
  bodyHtml?: string;
  /** If true (default), skip firing if already fired in this session */
  fireOnce?: boolean;
}

// ── A/B Test Node ───────────────────────────────────────────────────────────

export interface ABTestVariant {
  id: string;
  label: string;
  /** Weight percentage (0–100). All variants should sum to 100. */
  weight: number;
}

export interface ABTestNodeData {
  id: string;
  label?: string;
  variants: ABTestVariant[];
}

// ── Wait Node ───────────────────────────────────────────────────────────────

export type WaitUnit = 'seconds' | 'minutes' | 'hours';

/** Visual feedback shown to the user during a Wait node */
export type WaitFeedbackMode = 'button_countdown' | 'button_text' | 'loading_screen';

/** Action to take when user skips the wait */
export type WaitSkipAction = 'continue' | 'go_to_page' | 'reduce_time';

export interface WaitFeedbackConfig {
  mode: WaitFeedbackMode;
  /** Custom text shown on the button or loading screen */
  buttonText?: string;
  /** For loading_screen: which loading style to use */
  loadingStyle?: 'bar' | 'circular' | 'infinite';
  /** For loading_screen: label shown above the loading indicator */
  loadingLabel?: string;
  /** Allow user to skip/cancel the wait and advance immediately */
  allowSkip?: boolean;
  /** What happens when user skips — defaults to 'continue' */
  skipAction?: WaitSkipAction;
  /** For 'go_to_page': which page to navigate to */
  skipTargetPageId?: string;
  /** For 'reduce_time': how many units to reduce */
  skipReduceAmount?: number;
  /** For 'reduce_time': unit of the reduction */
  skipReduceUnit?: WaitUnit;
  /** Custom text for the skip button */
  skipButtonText?: string;
  /** Show a toast notification when entering the wait */
  showToast?: boolean;
  /** Toast title */
  toastTitle?: string;
  /** Toast description */
  toastDescription?: string;
}

export interface WaitNodeData {
  id: string;
  label?: string;
  duration: number;
  unit: WaitUnit;
  /** Visual feedback config — defaults to button_countdown */
  feedback?: WaitFeedbackConfig;
}

// ── Jump Node ───────────────────────────────────────────────────────────────

export interface JumpNodeData {
  id: string;
  label?: string;
  /** The page ID to jump to */
  targetPageId?: string;
}

// ── AI Node ─────────────────────────────────────────────────────────────────

export type AIObjective = 'summarize' | 'classify' | 'generate' | 'extract' | 'custom';

export interface AINodeData {
  id: string;
  label?: string;
  /** What the AI should do */
  objective: AIObjective;
  /** Custom prompt (used when objective is 'custom' or as additional instruction) */
  prompt?: string;
  /** System-level instructions */
  systemPrompt?: string;
  /** Input fields: element IDs or variable names whose values feed the prompt */
  inputSources?: string[];
  /** Variable ID where the AI response text is stored */
  outputVariableId?: string;
  /** Whether to block the user flow until AI responds */
  executionMode?: 'sync' | 'async';
  /** AI model to use (defaults to gateway default) */
  model?: string;
  /** Max tokens for the response */
  maxTokens?: number;
  /** Temperature (0-1) for creativity */
  temperature?: number;
  /** If true (default), skip firing if already fired in this session */
  fireOnce?: boolean;
}

// ── Image Gen Node ──────────────────────────────────────────────────────────

export type ImageGenLayerType = 'text' | 'image' | 'shape';

export interface ImageGenTextLayer {
  id: string;
  type: 'text';
  /** Content string — supports {{variable}}, {{field:id}}, etc. */
  content: string;
  /** X position in percentage (0–100) */
  x: number;
  /** Y position in percentage (0–100) */
  y: number;
  fontSize: number;
  fontColor: string;
  fontFamily?: string;
  fontWeight?: string;
  textAlign?: 'left' | 'center' | 'right';
  /** Max width in percentage of the canvas */
  maxWidth?: number;
}

export interface ImageGenImageLayer {
  id: string;
  type: 'image';
  /** Image URL or {{variable}} */
  src: string;
  x: number;
  y: number;
  /** Width in percentage (0–100) */
  width: number;
  /** Height in percentage (0–100) */
  height: number;
  borderRadius?: number;
  opacity?: number;
}

export interface ImageGenShapeLayer {
  id: string;
  type: 'shape';
  shapeType: 'rectangle' | 'circle' | 'badge';
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor: string;
  borderRadius?: number;
  borderColor?: string;
  borderWidth?: number;
  opacity?: number;
}

export type ImageGenLayer = ImageGenTextLayer | ImageGenImageLayer | ImageGenShapeLayer;

export interface ImageGenNodeData {
  id: string;
  label?: string;
  /** Background image URL */
  backgroundImage?: string;
  /** Output image width in px (default 1200) */
  outputWidth?: number;
  /** Output image height in px (default 630) */
  outputHeight?: number;
  /** Layers rendered on top of the background */
  layers: ImageGenLayer[];
  /** Variable ID where the generated image URL is stored */
  outputVariableId?: string;
  /** If true (default), skip firing if already fired in this session */
  fireOnce?: boolean;
}


export interface FormPixelEvent {
  id: string;
  platform: AnalyticsPlatform;
  /** 'PageView' is default; use PixelEventType for others */
  eventType: PixelEventType | 'PageView';
  customEventName?: string;
  /** Map lead data fields to specific form elements */
  userDataMapping?: UserDataMapping;
}

export interface FlowEdge {
  id: string;
  source: string;
  sourceHandle?: string;
  target: string;
  label?: string;
}

/** Style settings for a funnel page */
export interface FunnelPageStyle {
  backgroundColor?: string;
  fontFamily?: string;
  gap?: number;        // px between elements
  paddingX?: number;   // horizontal padding
  paddingY?: number;   // vertical padding
}

/** How a variable gets its value when a page is visited */
export type VariableAssignmentSource = 'field' | 'free' | 'context' | 'param';

export interface VariableAssignment {
  id: string;
  variableId: string;
  /** 'field' = copy from a form element's answer; 'free' = static text (may use {{var}} interpolation) */
  sourceType: VariableAssignmentSource;
  /** When sourceType === 'field': the element whose answer to read */
  sourceElementId?: string;
  /** When sourceType === 'free': the literal value (may contain {{vars}}) */
  value?: string;
}

/** A funnel page — the primary building block. Each page contains elements (layout + fields). */
export interface FunnelPage {
  id: string;
  title: string;
  elements: import('./pageElements').PageElement[];
  pageStyle?: FunnelPageStyle;
  /** Variable assignments executed when this page is entered */
  variableAssignments?: VariableAssignment[];
}

export function createDefaultFunnelPage(title?: string): FunnelPage {
  return {
    id: crypto.randomUUID(),
    title: title || 'Nova página',
    elements: [],
    pageStyle: {
      backgroundColor: '',
      fontFamily: 'Borna',
      gap: 32,
      paddingX: 24,
      paddingY: 32,
    },
  };
}

/** Variable type for the form variables system */
export type FormVariableType = 'text' | 'number' | 'boolean' | 'response';

export interface FormVariable {
  id: string;
  name: string;
  type: FormVariableType;
  defaultValue?: string;
  /** For 'response' type: the element ID whose answer populates this variable */
  sourceElementId?: string;
  /** For 'response' type: the page ID containing the source element */
  sourcePageId?: string;
}

export interface FormData {
  id: string;
  title: string;
  description?: string;
  welcomeTitle?: string;
  welcomeDescription?: string;
  thankYouTitle?: string;
  thankYouDescription?: string;
  /** @deprecated — use pages instead */
  questions: Question[];
  /** Funnel pages — the primary workflow unit */
  pages: FunnelPage[];
  /** Global page style — shared by all pages */
  globalPageStyle?: FunnelPageStyle;
  /** Whether to show a welcome/start screen before the first page */
  showWelcomeScreen?: boolean;
  /** The welcome screen page (editable via page builder) */
  welcomePage?: FunnelPage;
  /** The thank you / end screen page (editable via page builder, always shown) */
  thankYouPage?: FunnelPage;
  conditions?: ConditionNodeData[];
  variableOpNodes?: VariableOpNodeData[];
  integrationNodes?: IntegrationNodeData[];
  analyticsNodes?: AnalyticsNodeData[];
  /** WhatsApp (Evolution API) nodes */
  whatsappNodes?: WhatsAppNodeData[];
  /** Email (Resend) nodes */
  emailNodes?: EmailNodeData[];
  /** A/B Test nodes */
  abTestNodes?: ABTestNodeData[];
  /** Wait / delay nodes */
  waitNodes?: WaitNodeData[];
  /** Jump to page nodes */
  jumpNodes?: JumpNodeData[];
  /** AI processing nodes */
  aiNodes?: AINodeData[];
  /** Image generation / composition nodes */
  imageGenNodes?: ImageGenNodeData[];
  /** Pixel events fired automatically when the form is loaded */
  pixelLoadEvents?: FormPixelEvent[];
  nodePositions?: NodePosition[];
  /** IDs of nodes that are disabled (skipped during execution) */
  disabledNodes?: string[];
  flowEdges?: FlowEdge[];
  /** Form variables for dynamic content and logic */
  variables?: FormVariable[];
  style: FormStyle;
  status: 'draft' | 'published' | 'closed' | 'archived';
  closedMessage?: string;
  closedRedirectUrl?: string;
  /** URL to redirect when form is not found (draft/deleted) */
  notFoundRedirectUrl?: string;
  createdAt: string;
  updatedAt: string;
  responseCount: number;
  completionRate: number;
  /** Folder this form belongs to */
  folderId?: string | null;
  /** Webhook URL to POST complete submissions to */
  completionWebhookUrl?: string;
  /** Allow respondents to resume from where they left off */
  allowResume?: boolean;
  /** Save partial (incomplete) responses */
  savePartialResponses?: boolean;
  /** Enable geolocation capture for respondents */
  enableGeolocation?: boolean;
  /** Show progress bar at the top of the form */
  showProgressBar?: boolean;
  /** Enable AI sentiment/emotion analysis for responses */
  enableSentimentAnalysis?: boolean;
  /** Google Sheet ID linked for response sync */
  googleSheetId?: string;
  /** Google Sheet URL for display */
  googleSheetUrl?: string;
  /** GET parameters tracked as columns in responses table and Google Sheets */
  trackedParams?: TrackedParam[];
  /** SEO settings */
  seo?: FormSEO;
}

/** SEO configuration for the form's public page */
export interface FormSEO {
  title?: string;
  description?: string;
  keywords?: string;
  ogImage?: string;
  ogType?: string;
  canonicalUrl?: string;
  robots?: string;
  twitterCard?: 'summary' | 'summary_large_image';
  structuredData?: string;
  favicon?: string;
  themeColor?: string;
}

/** A GET parameter mapped to appear in responses table / Google Sheets */
export interface TrackedParam {
  id: string;
  key: string;
  label?: string;
  enabled: boolean;
}

/** Default tracked params for new forms */
export const DEFAULT_TRACKED_PARAMS: TrackedParam[] = [
  { id: 'utm_source', key: 'utm_source', label: 'UTM Source', enabled: true },
  { id: 'utm_medium', key: 'utm_medium', label: 'UTM Medium', enabled: true },
  { id: 'utm_campaign', key: 'utm_campaign', label: 'UTM Campaign', enabled: true },
  { id: 'utm_content', key: 'utm_content', label: 'UTM Content', enabled: true },
  { id: 'utm_term', key: 'utm_term', label: 'UTM Term', enabled: true },
];

export const QUESTION_CATEGORIES: Record<QuestionCategory, { label: string; types: QuestionType[] }> = {
  contact_info: {
    label: 'Informações de Contato',
    types: ['contact_info', 'email', 'phone', 'address', 'website'],
  },
  text: {
    label: 'Texto',
    types: ['short_text', 'long_text'],
  },
  choice: {
    label: 'Escolha',
    types: ['multiple_choice', 'single_choice', 'dropdown', 'yes_no', 'legal', 'checkbox'],
  },
  rating_ranking: {
    label: 'Avaliação & Ranking',
    types: ['nps', 'opinion_scale', 'rating', 'ranking'],
  },
  other: {
    label: 'Outros',
    types: ['number', 'date', 'file_upload', 'statement', 'graphic', 'welcome_screen'],
  },
  ending: {
    label: 'Encerramento',
    types: ['end_screen', 'redirect_url'],
  },
  integration: {
    label: 'Integração',
    types: ['webhook'],
  },
};

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  contact_info: 'Informações de Contato',
  email: 'Email',
  phone: 'Telefone',
  address: 'Endereço',
  website: 'Website',
  short_text: 'Texto curto',
  long_text: 'Texto longo',
  multiple_choice: 'Múltipla escolha',
  single_choice: 'Seleção única',
  dropdown: 'Dropdown',
  yes_no: 'Sim/Não',
  legal: 'Termos legais',
  checkbox: 'Checkbox',
  nps: 'NPS',
  opinion_scale: 'Escala de opinião',
  rating: 'Avaliação',
  ranking: 'Ranking',
  number: 'Número',
  date: 'Data',
  file_upload: 'Upload de arquivo',
  statement: 'Statement',
  graphic: 'Gráfico',
  welcome_screen: 'Tela de boas-vindas',
  end_screen: 'Tela final',
  redirect_url: 'Redirecionar URL',
  webhook: 'Webhook',
};

export const DEFAULT_FORM_STYLE: FormStyle = {
  primaryColor: '220 18% 20%',
  backgroundColor: '#FAFAF6',
  fontFamily: 'Borna',
  backgroundType: 'solid',
  textColor: '#203300',
  headingFontFamily: 'Borna',
  bodyFontFamily: 'Borna',
};

export function createDefaultConditionGroup(firstQuestionId: string): ConditionGroup {
  return {
    id: crypto.randomUUID(),
    logic: 'and',
    rules: [{
      id: crypto.randomUUID(),
      questionId: firstQuestionId,
      operator: 'equals',
      value: '',
    }],
    groups: [],
  };
}

export function createDefaultQuestion(type: QuestionType): Question {
  const base: Question = {
    id: crypto.randomUUID(),
    type,
    title: '',
    required: false,
    mask: { type: 'none' },
  };

  if (type === 'multiple_choice' || type === 'single_choice' || type === 'dropdown' || type === 'ranking') {
    base.options = [
      { id: crypto.randomUUID(), label: 'Opção 1' },
      { id: crypto.randomUUID(), label: 'Opção 2' },
    ];
  }

  if (type === 'rating') base.maxRating = 5;

  if (type === 'yes_no') {
    base.options = [
      { id: crypto.randomUUID(), label: 'Sim' },
      { id: crypto.randomUUID(), label: 'Não' },
    ];
  }

  if (type === 'nps') {
    base.scaleMin = 0;
    base.scaleMax = 10;
    base.labelMin = 'Nada provável';
    base.labelMax = 'Extremamente provável';
  }

  if (type === 'opinion_scale') {
    base.scaleMin = 1;
    base.scaleMax = 5;
    base.labelMin = 'Discordo';
    base.labelMax = 'Concordo';
  }

  if (type === 'phone') base.mask = { type: 'phone' };
  if (type === 'welcome_screen') base.buttonText = 'Começar';
  if (type === 'end_screen') base.buttonText = 'Enviar novamente';
  if (type === 'statement') base.buttonText = 'Continuar';
  if (type === 'graphic') {
    base.title = 'Visualização';
    base.graphicVariant = 'kpis';
    base.graphicChartType = 'bar';
    base.graphicData = [
      { id: crypto.randomUUID(), label: 'Item 1', value: '75', suffix: '%' },
      { id: crypto.randomUUID(), label: 'Item 2', value: '120', suffix: '' },
    ];
  }
  if (type === 'legal') base.required = true;
  if (type === 'file_upload') {
    base.allowedFileTypes = ['image/*', 'application/pdf'];
    base.maxFileSize = 10;
  }
  if (type === 'webhook') {
    base.webhookUrl = '';
    base.webhookMethod = 'POST';
    base.title = 'Webhook';
  }

  return base;
}
