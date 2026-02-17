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

export interface FormStyle {
  primaryColor: string;
  backgroundColor: string;
  fontFamily: string;
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

/** A single rule: "question X operator value" */
export interface ConditionRule {
  id: string;
  questionId: string;
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
export type VariableAssignmentSource = 'field' | 'free';

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
      fontFamily: 'Inter',
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
  conditions?: ConditionNodeData[];
  variableOpNodes?: VariableOpNodeData[];
  nodePositions?: NodePosition[];
  flowEdges?: FlowEdge[];
  /** Form variables for dynamic content and logic */
  variables?: FormVariable[];
  style: FormStyle;
  status: 'draft' | 'published' | 'archived';
  createdAt: string;
  updatedAt: string;
  responseCount: number;
  completionRate: number;
}

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
  backgroundColor: '30 20% 98%',
  fontFamily: 'Inter',
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
