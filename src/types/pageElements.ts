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
  | 'input_weight';

export interface PageElementStyle {
  textAlign?: 'left' | 'center' | 'right';
  fontSize?: string;
  fontWeight?: string;
  color?: string;
  backgroundColor?: string;
  padding?: number;
  borderRadius?: number;
  maxWidth?: string;
}

export interface SelectOption {
  id: string;
  label: string;
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
  // Form field properties
  label?: string;
  placeholder?: string;
  required?: boolean;
  options?: SelectOption[];
  maxRating?: number;
  smartValidation?: boolean;
  defaultCountryCode?: string;
  /** Unit for height/weight fields */
  unit?: string;
  /** Whether user can toggle between units (e.g. kg/lb) */
  allowUnitToggle?: boolean;
  /** Default/pre-filled value for any form field */
  defaultValue?: any;
  /** Min/max for number/height/weight fields */
  min?: number;
  max?: number;
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
};

export type ElementCategory = 'visual' | 'fields';

export const ELEMENT_CATEGORIES: Record<ElementCategory, { label: string; types: PageElementType[] }> = {
  visual: {
    label: 'Layout',
    types: ['heading', 'text', 'image', 'button', 'divider', 'video', 'spacer'],
  },
  fields: {
    label: 'Formulário',
    types: ['input_text', 'input_email', 'input_phone', 'input_number', 'input_textarea', 'input_date', 'input_height', 'input_weight', 'input_address', 'input_checkbox', 'input_select', 'input_radio', 'input_rating'],
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
      base.style = { textAlign: 'center' };
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
  }

  return base;
}
