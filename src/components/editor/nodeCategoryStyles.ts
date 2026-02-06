import { QuestionType, QuestionCategory, QUESTION_CATEGORIES } from '@/types/form';

const TYPE_TO_CATEGORY: Record<QuestionType, QuestionCategory> = {} as any;
for (const [cat, data] of Object.entries(QUESTION_CATEGORIES)) {
  for (const t of data.types) {
    (TYPE_TO_CATEGORY as any)[t] = cat;
  }
}

export function getCategoryForType(type: QuestionType): QuestionCategory {
  return TYPE_TO_CATEGORY[type] || 'other';
}

const CATEGORY_STYLES: Record<QuestionCategory, { bg: string; accent: string; border: string }> = {
  contact_info: {
    bg: 'bg-node-contact',
    accent: 'text-node-contact-accent',
    border: 'border-node-contact-accent/30',
  },
  text: {
    bg: 'bg-node-text',
    accent: 'text-node-text-accent',
    border: 'border-node-text-accent/30',
  },
  choice: {
    bg: 'bg-node-choice',
    accent: 'text-node-choice-accent',
    border: 'border-node-choice-accent/30',
  },
  rating_ranking: {
    bg: 'bg-node-rating',
    accent: 'text-node-rating-accent',
    border: 'border-node-rating-accent/30',
  },
  other: {
    bg: 'bg-node-other',
    accent: 'text-node-other-accent',
    border: 'border-node-other-accent/30',
  },
  ending: {
    bg: 'bg-node-ending',
    accent: 'text-node-ending-accent',
    border: 'border-node-ending-accent/30',
  },
  integration: {
    bg: 'bg-node-integration',
    accent: 'text-node-integration-accent',
    border: 'border-node-integration-accent/30',
  },
};

export function getNodeCategoryStyle(type: QuestionType) {
  const cat = getCategoryForType(type);
  return CATEGORY_STYLES[cat];
}
