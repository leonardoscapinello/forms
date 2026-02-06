export type QuestionType =
  | 'short_text'
  | 'long_text'
  | 'multiple_choice'
  | 'single_choice'
  | 'rating'
  | 'email'
  | 'number'
  | 'date';

export interface QuestionOption {
  id: string;
  label: string;
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
}

export interface FormStyle {
  primaryColor: string;
  backgroundColor: string;
  fontFamily: string;
}

export interface FormData {
  id: string;
  title: string;
  description?: string;
  welcomeTitle?: string;
  welcomeDescription?: string;
  thankYouTitle?: string;
  thankYouDescription?: string;
  questions: Question[];
  style: FormStyle;
  status: 'draft' | 'published' | 'archived';
  createdAt: string;
  updatedAt: string;
  responseCount: number;
  completionRate: number;
}

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  short_text: 'Texto curto',
  long_text: 'Texto longo',
  multiple_choice: 'Múltipla escolha',
  single_choice: 'Seleção única',
  rating: 'Avaliação',
  email: 'Email',
  number: 'Número',
  date: 'Data',
};

export const DEFAULT_FORM_STYLE: FormStyle = {
  primaryColor: '222.2 47.4% 11.2%',
  backgroundColor: '0 0% 100%',
  fontFamily: 'Inter',
};

export function createDefaultQuestion(type: QuestionType): Question {
  const base: Question = {
    id: crypto.randomUUID(),
    type,
    title: '',
    required: false,
  };

  if (type === 'multiple_choice' || type === 'single_choice') {
    base.options = [
      { id: crypto.randomUUID(), label: 'Opção 1' },
      { id: crypto.randomUUID(), label: 'Opção 2' },
    ];
  }

  if (type === 'rating') {
    base.maxRating = 5;
  }

  return base;
}
