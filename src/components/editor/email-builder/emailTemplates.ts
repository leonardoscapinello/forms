import { type ColumnsBlock, type EmailBlock, createStructure, uid } from './emailBlockTypes';
import { Mail, PartyPopper, Gift, Bell, ShieldCheck, Megaphone, Leaf, Sparkles, Heart, Zap } from 'lucide-react';

// ─── Brand palette ──────────────────────────────────────────────────
// Neutral ink scale for the Forms visual identity
// Neutral surface scale for legacy templates
const BRAND = {
  ink: {
    50: '#FAFAFA',
    100: '#F5F5F5',
    200: '#E5E5E5',
    300: '#D4D4D4',
    400: '#A3A3A3',
    500: '#737373',
    600: '#525252',
    700: '#404040',
    800: '#262626',
    900: '#171717',
    950: '#050505',
  },
  paper: {
    50: '#FAFAFA',
    100: '#F4F4F5',
    200: '#E4E4E7',
    300: '#D4D4D8',
    400: '#A1A1AA',
    500: '#71717A',
    600: '#52525B',
    700: '#3F3F46',
    800: '#27272A',
    900: '#18181B',
    950: '#09090B',
  },
} as const;

export interface EmailTemplate {
  id: string;
  label: string;
  description: string;
  icon: typeof Mail;
  blocks: ColumnsBlock[];
  emailBg: string;
  contentBg: string;
}

function text(content: string, opts: Partial<EmailBlock & { type: 'text' }> = {}): EmailBlock {
  return {
    id: uid(), type: 'text',
    padding: { top: 8, right: 24, bottom: 8, left: 24 },
    content, align: 'left', fontSize: 16, fontWeight: 'normal', color: BRAND.paper[950],
    ...opts,
  } as EmailBlock;
}

function heading(content: string, opts: Partial<EmailBlock & { type: 'text' }> = {}): EmailBlock {
  return text(content, { fontSize: 24, fontWeight: 'bold', align: 'center', color: BRAND.paper[950], padding: { top: 24, right: 24, bottom: 8, left: 24 }, ...opts });
}

function button(label: string, href = '#', opts: Partial<EmailBlock & { type: 'button' }> = {}): EmailBlock {
  return {
    id: uid(), type: 'button',
    padding: { top: 16, right: 24, bottom: 16, left: 24 },
    text: label, href, linkMode: 'custom', bgColor: BRAND.ink[600], textColor: '#FFFFFF',
    borderRadius: 6, align: 'center', fontSize: 16, paddingX: 32, paddingY: 12,
    ...opts,
  } as EmailBlock;
}

function image(src = '', opts: Partial<EmailBlock & { type: 'image' }> = {}): EmailBlock {
  return {
    id: uid(), type: 'image',
    padding: { top: 8, right: 24, bottom: 8, left: 24 },
    src, alt: '', width: '100%', align: 'center', link: '',
    ...opts,
  } as EmailBlock;
}

function divider(color: string = BRAND.paper[300]): EmailBlock {
  return {
    id: uid(), type: 'divider',
    padding: { top: 8, right: 24, bottom: 8, left: 24 },
    color, thickness: 1, width: '100%',
  } as EmailBlock;
}

function spacer(height = 20): EmailBlock {
  return {
    id: uid(), type: 'spacer',
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    height,
  } as EmailBlock;
}

function row(elements: EmailBlock[], colCount = 1): ColumnsBlock {
  const s = createStructure(colCount);
  if (colCount === 1) {
    s.columns[0] = elements;
  } else {
    elements.forEach((el, i) => {
      const col = i % colCount;
      s.columns[col].push(el);
    });
  }
  return s;
}

// ─── Templates ──────────────────────────────────────────────────────

const welcomeTemplate: EmailTemplate = {
  id: 'welcome',
  label: 'Boas-vindas',
  description: 'E-mail de boas-vindas com identidade da marca',
  icon: PartyPopper,
  emailBg: BRAND.paper[100],
  contentBg: '#FFFFFF',
  blocks: [
    row([spacer(16)]),
    row([heading('Bem-vindo! 🎉')]),
    row([text('Estamos muito felizes em ter você conosco. Preparamos tudo para que sua experiência seja incrível desde o primeiro momento.', { align: 'center', color: BRAND.paper[800] })]),
    row([spacer(8)]),
    row([button('Começar agora', '#')]),
    row([spacer(8)]),
    row([divider()]),
    row([text('Se tiver alguma dúvida, responda este e-mail. Estamos aqui para ajudar!', { fontSize: 14, align: 'center', color: BRAND.paper[700] })]),
    row([spacer(16)]),
  ],
};

const confirmationTemplate: EmailTemplate = {
  id: 'confirmation',
  label: 'Confirmação',
  description: 'Confirmação com destaque neutro',
  icon: ShieldCheck,
  emailBg: BRAND.ink[50],
  contentBg: '#FFFFFF',
  blocks: [
    row([spacer(16)]),
    row([heading('Recebemos sua resposta ✅', { color: BRAND.ink[900] })]),
    row([text('Sua resposta foi registrada com sucesso. Veja um resumo abaixo:', { align: 'center', color: BRAND.paper[800] })]),
    row([spacer(8)]),
    row([divider(BRAND.ink[200])]),
    row([text('📋 Detalhes da submissão', { fontWeight: 'bold', fontSize: 18, color: BRAND.ink[800] })]),
    row([text('• Nome: {{nome}}\n• E-mail: {{email}}\n• Data: {{data}}', { fontSize: 14, color: BRAND.paper[950] })]),
    row([divider(BRAND.ink[200])]),
    row([spacer(8)]),
    row([button('Ver detalhes', '#', { bgColor: BRAND.ink[700] })]),
    row([spacer(16)]),
  ],
};

const promotionTemplate: EmailTemplate = {
  id: 'promotion',
  label: 'Promoção',
  description: 'E-mail promocional com visual vibrante',
  icon: Gift,
  emailBg: BRAND.paper[200],
  contentBg: '#FFFFFF',
  blocks: [
    row([spacer(16)]),
    row([image('', { padding: { top: 0, right: 0, bottom: 0, left: 0 } })]),
    row([heading('Oferta Especial 🔥', { color: BRAND.ink[800] })]),
    row([text('Por tempo limitado, aproveite condições exclusivas preparadas especialmente para você.', { align: 'center', color: BRAND.paper[800] })]),
    row([spacer(8)]),
    row([button('Aproveitar agora', '#', { bgColor: BRAND.ink[700] })]),
    row([spacer(8)]),
    row([divider()]),
    row([text('⏰ Oferta válida até 00/00/0000', { fontSize: 13, align: 'center', color: BRAND.paper[700] })]),
    row([spacer(16)]),
  ],
};

const notificationTemplate: EmailTemplate = {
  id: 'notification',
  label: 'Notificação',
  description: 'Alerta com tom neutro e elegante',
  icon: Bell,
  emailBg: BRAND.paper[50],
  contentBg: '#FFFFFF',
  blocks: [
    row([spacer(16)]),
    row([heading('Nova atualização 🔔', { color: BRAND.paper[950] })]),
    row([text('Temos novidades importantes para você. Confira o que mudou:', { align: 'center', color: BRAND.paper[800] })]),
    row([spacer(8)]),
    row([divider()]),
    row([text('Sua solicitação foi processada e já está disponível para acesso.', { fontSize: 14, color: BRAND.paper[950] })]),
    row([spacer(8)]),
    row([button('Ver agora', '#')]),
    row([spacer(16)]),
  ],
};

const newsletterTemplate: EmailTemplate = {
  id: 'newsletter',
  label: 'Newsletter',
  description: 'Layout editorial com 2 colunas',
  icon: Megaphone,
  emailBg: BRAND.paper[100],
  contentBg: '#FFFFFF',
  blocks: [
    row([spacer(16)]),
    row([heading('Newsletter Semanal 📰')]),
    row([text('As principais novidades da semana, direto no seu e-mail.', { align: 'center', color: BRAND.paper[800] })]),
    row([spacer(8)]),
    row([divider()]),
    (() => {
      const s = createStructure(2);
      s.columns[0] = [
        image(''),
        text('Artigo em destaque', { fontWeight: 'bold', fontSize: 14 }),
        text('Um resumo rápido sobre o assunto mais relevante da semana.', { fontSize: 13, color: BRAND.paper[800] }),
      ];
      s.columns[1] = [
        image(''),
        text('Segundo destaque', { fontWeight: 'bold', fontSize: 14 }),
        text('Mais conteúdo relevante para manter você atualizado.', { fontSize: 13, color: BRAND.paper[800] }),
      ];
      s.padding = { top: 8, right: 12, bottom: 8, left: 12 };
      return s;
    })(),
    row([spacer(8)]),
    row([button('Ler mais no site', '#')]),
    row([spacer(8)]),
    row([divider()]),
    row([text('Você está recebendo este e-mail porque se inscreveu em nossa lista.', { fontSize: 12, align: 'center', color: BRAND.paper[700] })]),
    row([spacer(16)]),
  ],
};

// ─── New brand templates ────────────────────────────────────────────

const onboardingTemplate: EmailTemplate = {
  id: 'onboarding',
  label: 'Onboarding',
  description: 'Sequência de boas-vindas com passos',
  icon: Sparkles,
  emailBg: BRAND.ink[50],
  contentBg: '#FFFFFF',
  blocks: [
    row([spacer(20)]),
    row([heading('Vamos começar! 🚀', { color: BRAND.ink[800] })]),
    row([text('Siga esses 3 passos simples para aproveitar ao máximo:', { align: 'center', color: BRAND.paper[800] })]),
    row([spacer(12)]),
    (() => {
      const s = createStructure(3);
      s.columns[0] = [
        text('1️⃣', { align: 'center', fontSize: 28, padding: { top: 16, right: 8, bottom: 4, left: 8 } }),
        text('Complete seu perfil', { align: 'center', fontWeight: 'bold', fontSize: 14, padding: { top: 0, right: 8, bottom: 4, left: 8 } }),
        text('Adicione suas informações básicas.', { align: 'center', fontSize: 12, color: BRAND.paper[700], padding: { top: 0, right: 8, bottom: 16, left: 8 } }),
      ];
      s.columns[1] = [
        text('2️⃣', { align: 'center', fontSize: 28, padding: { top: 16, right: 8, bottom: 4, left: 8 } }),
        text('Configure seu projeto', { align: 'center', fontWeight: 'bold', fontSize: 14, padding: { top: 0, right: 8, bottom: 4, left: 8 } }),
        text('Personalize do seu jeito.', { align: 'center', fontSize: 12, color: BRAND.paper[700], padding: { top: 0, right: 8, bottom: 16, left: 8 } }),
      ];
      s.columns[2] = [
        text('3️⃣', { align: 'center', fontSize: 28, padding: { top: 16, right: 8, bottom: 4, left: 8 } }),
        text('Convide seu time', { align: 'center', fontWeight: 'bold', fontSize: 14, padding: { top: 0, right: 8, bottom: 4, left: 8 } }),
        text('Colabore com sua equipe.', { align: 'center', fontSize: 12, color: BRAND.paper[700], padding: { top: 0, right: 8, bottom: 16, left: 8 } }),
      ];
      s.padding = { top: 8, right: 8, bottom: 8, left: 8 };
      return s;
    })(),
    row([spacer(8)]),
    row([button('Começar agora', '#', { bgColor: BRAND.ink[700] })]),
    row([spacer(8)]),
    row([divider(BRAND.ink[200])]),
    row([text('Precisa de ajuda? Responda este e-mail.', { fontSize: 13, align: 'center', color: BRAND.paper[700] })]),
    row([spacer(16)]),
  ],
};

const thankYouTemplate: EmailTemplate = {
  id: 'thankyou',
  label: 'Agradecimento',
  description: 'Mensagem de agradecimento pós-ação',
  icon: Heart,
  emailBg: BRAND.paper[200],
  contentBg: BRAND.paper[50],
  blocks: [
    row([spacer(24)]),
    row([heading('Obrigado! 🖤', { color: BRAND.ink[800] })]),
    row([text('Agradecemos por dedicar seu tempo. Sua participação faz toda a diferença para nós.', { align: 'center', color: BRAND.paper[900], fontSize: 17 })]),
    row([spacer(12)]),
    row([divider(BRAND.paper[400])]),
    row([spacer(8)]),
    row([text('O que acontece agora?', { fontWeight: 'bold', fontSize: 18, color: BRAND.ink[800], align: 'center' })]),
    row([text('Nossa equipe vai analisar suas informações e em breve você receberá um retorno com os próximos passos.', { align: 'center', fontSize: 14, color: BRAND.paper[800] })]),
    row([spacer(12)]),
    row([button('Acompanhar status', '#', { bgColor: BRAND.ink[700] })]),
    row([spacer(24)]),
  ],
};

const updateTemplate: EmailTemplate = {
  id: 'update',
  label: 'Atualização',
  description: 'Informativo com visual limpo e moderno',
  icon: Zap,
  emailBg: BRAND.paper[100],
  contentBg: '#FFFFFF',
  blocks: [
    row([spacer(16)]),
    row([text('📢 NOVIDADE', { align: 'center', fontSize: 11, fontWeight: 'bold', color: BRAND.ink[700], padding: { top: 16, right: 24, bottom: 0, left: 24 } })]),
    row([heading('Temos algo novo para você')]),
    row([divider(BRAND.ink[200])]),
    row([spacer(4)]),
    row([image('')]),
    row([text('Acabamos de lançar uma funcionalidade que vai transformar a forma como você trabalha. Confira todos os detalhes.', { color: BRAND.paper[900], fontSize: 15 })]),
    row([spacer(8)]),
    row([button('Saiba mais', '#')]),
    row([spacer(12)]),
    row([divider()]),
    row([text('Você recebeu este e-mail por estar cadastrado em nossa base.', { fontSize: 11, align: 'center', color: BRAND.paper[700] })]),
    row([spacer(16)]),
  ],
};

const naturalTemplate: EmailTemplate = {
  id: 'natural',
  label: 'Natural',
  description: 'Design orgânico com tons da natureza',
  icon: Leaf,
  emailBg: BRAND.ink[100],
  contentBg: BRAND.ink[50],
  blocks: [
    row([spacer(24)]),
    row([heading('🌿', { fontSize: 36, padding: { top: 0, right: 24, bottom: 4, left: 24 } })]),
    row([heading('Sustentabilidade em ação', { color: BRAND.ink[900], fontSize: 22 })]),
    row([text('Acreditamos que cada ação conta. Confira como estamos contribuindo para um futuro mais verde.', { align: 'center', color: BRAND.ink[800], fontSize: 15 })]),
    row([spacer(12)]),
    (() => {
      const s = createStructure(2);
      s.columns[0] = [
        text('🌱', { align: 'center', fontSize: 24, padding: { top: 12, right: 8, bottom: 4, left: 8 } }),
        text('100% reciclável', { align: 'center', fontWeight: 'bold', fontSize: 14, color: BRAND.ink[800], padding: { top: 0, right: 8, bottom: 4, left: 8 } }),
        text('Nossos materiais são 100% recicláveis e sustentáveis.', { align: 'center', fontSize: 12, color: BRAND.ink[700], padding: { top: 0, right: 8, bottom: 12, left: 8 } }),
      ];
      s.columns[1] = [
        text('💧', { align: 'center', fontSize: 24, padding: { top: 12, right: 8, bottom: 4, left: 8 } }),
        text('Economia de água', { align: 'center', fontWeight: 'bold', fontSize: 14, color: BRAND.ink[800], padding: { top: 0, right: 8, bottom: 4, left: 8 } }),
        text('Processos que reduzem em 40% o consumo de água.', { align: 'center', fontSize: 12, color: BRAND.ink[700], padding: { top: 0, right: 8, bottom: 12, left: 8 } }),
      ];
      s.padding = { top: 8, right: 8, bottom: 8, left: 8 };
      return s;
    })(),
    row([spacer(8)]),
    row([button('Conhecer projeto', '#', { bgColor: BRAND.ink[800] })]),
    row([spacer(8)]),
    row([divider(BRAND.ink[300])]),
    row([text('Juntos por um planeta melhor.', { fontSize: 13, align: 'center', color: BRAND.ink[700], fontWeight: 'bold' })]),
    row([spacer(20)]),
  ],
};

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  welcomeTemplate,
  confirmationTemplate,
  onboardingTemplate,
  thankYouTemplate,
  promotionTemplate,
  notificationTemplate,
  newsletterTemplate,
  updateTemplate,
  naturalTemplate,
];
