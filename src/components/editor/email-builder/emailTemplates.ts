import { type ColumnsBlock, type EmailBlock, createStructure, uid } from './emailBlockTypes';
import { Mail, PartyPopper, Gift, Bell, ShieldCheck, Megaphone } from 'lucide-react';

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
    content, align: 'left', fontSize: 16, fontWeight: 'normal', color: '#333333',
    ...opts,
  } as EmailBlock;
}

function heading(content: string, opts: Partial<EmailBlock & { type: 'text' }> = {}): EmailBlock {
  return text(content, { fontSize: 24, fontWeight: 'bold', align: 'center', color: '#111827', padding: { top: 24, right: 24, bottom: 8, left: 24 }, ...opts });
}

function button(label: string, href = '#', opts: Partial<EmailBlock & { type: 'button' }> = {}): EmailBlock {
  return {
    id: uid(), type: 'button',
    padding: { top: 16, right: 24, bottom: 16, left: 24 },
    text: label, href, linkMode: 'custom', bgColor: '#4F46E5', textColor: '#FFFFFF',
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

function divider(): EmailBlock {
  return {
    id: uid(), type: 'divider',
    padding: { top: 8, right: 24, bottom: 8, left: 24 },
    color: '#E5E7EB', thickness: 1, width: '100%',
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
  description: 'E-mail de boas-vindas para novos contatos',
  icon: PartyPopper,
  emailBg: '#F9FAFB',
  contentBg: '#FFFFFF',
  blocks: [
    row([spacer(16)]),
    row([heading('Bem-vindo! 🎉')]),
    row([text('Estamos muito felizes em ter você conosco. Preparamos tudo para que sua experiência seja incrível desde o primeiro momento.', { align: 'center', color: '#6B7280' })]),
    row([spacer(8)]),
    row([button('Começar agora', '#')]),
    row([spacer(8)]),
    row([divider()]),
    row([text('Se tiver alguma dúvida, responda este e-mail. Estamos aqui para ajudar!', { fontSize: 14, align: 'center', color: '#9CA3AF' })]),
    row([spacer(16)]),
  ],
};

const confirmationTemplate: EmailTemplate = {
  id: 'confirmation',
  label: 'Confirmação',
  description: 'Confirmação de recebimento ou inscrição',
  icon: ShieldCheck,
  emailBg: '#F0FDF4',
  contentBg: '#FFFFFF',
  blocks: [
    row([spacer(16)]),
    row([heading('Recebemos sua resposta ✅', { color: '#166534' })]),
    row([text('Sua resposta foi registrada com sucesso. Veja um resumo abaixo:', { align: 'center', color: '#6B7280' })]),
    row([spacer(8)]),
    row([divider()]),
    row([text('📋 Detalhes da submissão', { fontWeight: 'bold', fontSize: 18 })]),
    row([text('• Nome: {{nome}}\n• E-mail: {{email}}\n• Data: {{data}}', { fontSize: 14, color: '#374151' })]),
    row([divider()]),
    row([spacer(8)]),
    row([button('Ver detalhes', '#', { bgColor: '#16A34A' })]),
    row([spacer(16)]),
  ],
};

const promotionTemplate: EmailTemplate = {
  id: 'promotion',
  label: 'Promoção',
  description: 'E-mail promocional com destaque visual',
  icon: Gift,
  emailBg: '#FDF2F8',
  contentBg: '#FFFFFF',
  blocks: [
    row([spacer(16)]),
    row([image('', { padding: { top: 0, right: 0, bottom: 0, left: 0 } })]),
    row([heading('Oferta Especial 🔥')]),
    row([text('Por tempo limitado, aproveite condições exclusivas preparadas especialmente para você.', { align: 'center', color: '#6B7280' })]),
    row([spacer(8)]),
    row([button('Aproveitar agora', '#', { bgColor: '#DB2777' })]),
    row([spacer(8)]),
    row([divider()]),
    row([text('⏰ Oferta válida até 00/00/0000', { fontSize: 13, align: 'center', color: '#9CA3AF' })]),
    row([spacer(16)]),
  ],
};

const notificationTemplate: EmailTemplate = {
  id: 'notification',
  label: 'Notificação',
  description: 'Alerta ou atualização de status',
  icon: Bell,
  emailBg: '#EFF6FF',
  contentBg: '#FFFFFF',
  blocks: [
    row([spacer(16)]),
    row([heading('Nova atualização 🔔', { color: '#1E40AF' })]),
    row([text('Temos novidades importantes para você. Confira o que mudou:', { align: 'center', color: '#6B7280' })]),
    row([spacer(8)]),
    row([divider()]),
    row([text('Sua solicitação foi processada e já está disponível para acesso.', { fontSize: 14, color: '#374151' })]),
    row([spacer(8)]),
    row([button('Ver agora', '#', { bgColor: '#2563EB' })]),
    row([spacer(16)]),
  ],
};

const newsletterTemplate: EmailTemplate = {
  id: 'newsletter',
  label: 'Newsletter',
  description: 'Layout para conteúdo editorial com 2 colunas',
  icon: Megaphone,
  emailBg: '#F9FAFB',
  contentBg: '#FFFFFF',
  blocks: [
    row([spacer(16)]),
    row([heading('Newsletter Semanal 📰')]),
    row([text('As principais novidades da semana, direto no seu e-mail.', { align: 'center', color: '#6B7280' })]),
    row([spacer(8)]),
    row([divider()]),
    (() => {
      const s = createStructure(2);
      s.columns[0] = [
        image(''),
        text('Artigo em destaque', { fontWeight: 'bold', fontSize: 14 }),
        text('Um resumo rápido sobre o assunto mais relevante da semana.', { fontSize: 13, color: '#6B7280' }),
      ];
      s.columns[1] = [
        image(''),
        text('Segundo destaque', { fontWeight: 'bold', fontSize: 14 }),
        text('Mais conteúdo relevante para manter você atualizado.', { fontSize: 13, color: '#6B7280' }),
      ];
      s.padding = { top: 8, right: 12, bottom: 8, left: 12 };
      return s;
    })(),
    row([spacer(8)]),
    row([button('Ler mais no site', '#')]),
    row([spacer(8)]),
    row([divider()]),
    row([text('Você está recebendo este e-mail porque se inscreveu em nossa lista.', { fontSize: 12, align: 'center', color: '#9CA3AF' })]),
    row([spacer(16)]),
  ],
};

export const EMAIL_TEMPLATES: EmailTemplate[] = [
  welcomeTemplate,
  confirmationTemplate,
  promotionTemplate,
  notificationTemplate,
  newsletterTemplate,
];
