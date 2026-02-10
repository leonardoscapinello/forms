/** Page Element types for the drag-and-drop page builder */

export type PageElementType =
  // Visual elements
  | 'heading'
  | 'text'
  | 'image'
  | 'button'
  | 'divider'
  | 'video'
  | 'spacer'
  | 'alert'
  | 'notification'
  | 'chart'
  // Layout elements
  | 'columns'
  // Section elements
  | 'arguments'
  | 'testimonials'
  | 'faq'
  | 'pricing'
  | 'before_after'
  | 'carousel'
  // Form input elements
  | 'input_text'
  | 'input_email'
  | 'input_phone'
  | 'input_address'
  | 'input_checkbox'
  | 'input_select'
  | 'input_radio'
  | 'input_rating'
  | 'input_number'
  | 'input_textarea'
  | 'input_date'
  | 'input_height'
  | 'input_weight'
  // Quiz elements
  | 'input_yes_no'
  | 'input_multi_select'
  | 'input_quiz_icon'
  | 'input_quiz_image';

export interface PageElementStyle {
  textAlign?: 'left' | 'center' | 'right';
  fontSize?: string;
  fontWeight?: string;
  fontFamily?: string;
  color?: string;
  backgroundColor?: string;
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
  borderStyle?: 'solid' | 'dashed' | 'dotted' | 'none';
  boxShadow?: string;
  maxWidth?: string;
  width?: string;
}

export interface SelectOption {
  id: string;
  label: string;
  emoji?: string;
  imageUrl?: string;
  /** Score added when this option is selected */
  score?: number;
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
  // Section elements
  argumentItems?: ArgumentItem[];
  testimonialItems?: TestimonialItem[];
  faqItems?: FAQItem[];
  pricingPlans?: PricingPlan[];
  beforeImage?: string;
  afterImage?: string;
  beforeAfterMode?: 'slider' | 'side_by_side';
  carouselImages?: CarouselImage[];
  // Form field properties
  label?: string;
  placeholder?: string;
  required?: boolean;
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
  image: 'Imagem',
  button: 'Botão',
  divider: 'Divisor',
  video: 'Vídeo',
  spacer: 'Espaço',
  alert: 'Atenção',
  notification: 'Notificação',
  chart: 'Gráfico',
  columns: 'Colunas',
  arguments: 'Argumentos',
  testimonials: 'Depoimentos',
  faq: 'FAQ',
  pricing: 'Preços',
  before_after: 'Antes e Depois',
  carousel: 'Carrossel',
  input_text: 'Campo',
  input_email: 'E-mail',
  input_phone: 'Telefone',
  input_address: 'Endereço',
  input_checkbox: 'Checkbox',
  input_select: 'Seleção',
  input_radio: 'Radio',
  input_rating: 'Avaliação',
  input_number: 'Número',
  input_textarea: 'Textarea',
  input_date: 'Data',
  input_height: 'Altura',
  input_weight: 'Peso',
  input_yes_no: 'Sim/Não',
  input_multi_select: 'Múltipla escolha',
  input_quiz_icon: 'Quiz com ícone',
  input_quiz_image: 'Quiz com imagem',
};

export type ElementCategory = 'visual' | 'data' | 'sections' | 'fields';

export const ELEMENT_CATEGORIES: Record<ElementCategory, { label: string; types: PageElementType[] }> = {
  visual: {
    label: 'Layout',
    types: ['heading', 'text', 'image', 'button', 'divider', 'video', 'spacer', 'alert', 'notification', 'columns'],
  },
  data: {
    label: 'Dados',
    types: ['chart'],
  },
  sections: {
    label: 'Seções',
    types: ['arguments', 'testimonials', 'faq', 'pricing', 'before_after', 'carousel'],
  },
  fields: {
    label: 'Formulário',
    types: ['input_text', 'input_email', 'input_phone', 'input_number', 'input_textarea', 'input_date', 'input_height', 'input_weight', 'input_address', 'input_checkbox', 'input_select', 'input_radio', 'input_rating', 'input_yes_no', 'input_multi_select', 'input_quiz_icon', 'input_quiz_image'],
  },
};

export function createDefaultPageElement(type: PageElementType): PageElement {
  const base: PageElement = {
    id: crypto.randomUUID(),
    type,
    style: { textAlign: 'left' },
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
  }

  return base;
}
