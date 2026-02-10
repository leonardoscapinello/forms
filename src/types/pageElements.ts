/** Page Element types for the drag-and-drop page builder */

export type PageElementType =
  | 'heading'
  | 'text'
  | 'image'
  | 'button'
  | 'divider'
  | 'video'
  | 'spacer'
  | 'form_field'; // embeds an existing question

export interface PageElementStyle {
  textAlign?: 'left' | 'center' | 'right';
  fontSize?: string;       // e.g. '2xl', 'lg', 'base', 'sm'
  fontWeight?: string;      // e.g. 'bold', 'semibold', 'normal'
  color?: string;           // hex color
  backgroundColor?: string;
  padding?: number;         // px
  borderRadius?: number;    // px
  maxWidth?: string;        // e.g. '100%', '600px'
}

export interface PageElement {
  id: string;
  type: PageElementType;
  // Content fields (used depending on type)
  content?: string;         // text content for heading, text, button
  src?: string;             // image/video URL
  alt?: string;             // image alt text
  href?: string;            // button link
  level?: 1 | 2 | 3 | 4;   // heading level
  height?: number;          // spacer height, divider thickness
  questionId?: string;      // for form_field type — references a Question
  style?: PageElementStyle;
}

export interface PageConfig {
  elements: PageElement[];
  backgroundColor?: string;
  backgroundImage?: string;
  maxWidth?: string;        // layout max width
}

export const PAGE_ELEMENT_LABELS: Record<PageElementType, string> = {
  heading: 'Título',
  text: 'Texto',
  image: 'Imagem',
  button: 'Botão',
  divider: 'Divisor',
  video: 'Vídeo',
  spacer: 'Espaço',
  form_field: 'Campo de Formulário',
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
    case 'form_field':
      base.questionId = '';
      break;
  }

  return base;
}
