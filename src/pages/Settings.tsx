import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/authContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  HardDrive, Save, TestTube, Loader2, CheckCircle2, XCircle, Eye, EyeOff,
  Settings2, Users, Plug, Shield, Plus, Trash2, UserCog, Mail, Radio, Tag,
  Pencil, Check, X, MessageSquare, BarChart3, ChevronRight, Brain,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ReoonIntegrationCard from '@/components/settings/ReoonIntegrationCard';
import PixelIntegrationsCard from '@/components/settings/PixelIntegrationsCard';
import GoogleOAuthCard from '@/components/settings/GoogleOAuthCard';
import EvolutionApiCard from '@/components/settings/EvolutionApiCard';
import ResendApiCard from '@/components/settings/ResendApiCard';
import OpenAIIntegrationCard from '@/components/settings/OpenAIIntegrationCard';
import EmailValidationsTab from '@/components/settings/EmailValidationsTab';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useTags } from '@/hooks/useTags';
import { getFunctionErrorMessage } from '@/lib/functionError';
import { useBrand } from '@/hooks/brandContext';
import {
  listIntegrationSettings,
  MASKED_INTEGRATION_SECRET,
  saveIntegrationSetting,
  withIntegrationTimeout,
} from '@/lib/integrationSettings';

// ─── Tab navigation ───
const TABS = [
  { id: 'general', label: 'Geral', icon: Settings2 },
  { id: 'users', label: 'Usuários', icon: Users },
  { id: 'tags', label: 'Tags', icon: Tag },
  { id: 'integrations', label: 'Integrações', icon: Plug },
  { id: 'pixels', label: 'Pixels & Webhooks', icon: Radio },
  { id: 'validations', label: 'Validações', icon: Mail },
  { id: 'security', label: 'Segurança', icon: Shield },
] as const;

type TabId = typeof TABS[number]['id'];

export default function Settings() {
  const [tab, setTab] = useState<TabId>('general');

  return (
    <div className="flex flex-col md:flex-row min-h-[calc(100vh-4rem)]">
      {/* Sidebar — horizontal scroll on mobile */}
      <aside className="md:w-56 shrink-0 border-b md:border-b-0 md:border-r border-border bg-muted/30 py-3 md:py-6 px-3 md:space-y-1">
        <h1 className="hidden md:block text-sm font-semibold text-foreground tracking-tight px-3 mb-4">Configurações</h1>
        <div className="flex md:flex-col gap-1 overflow-x-auto md:overflow-x-visible pb-1 md:pb-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap shrink-0 ${
                tab === t.id
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
              aria-pressed={tab === t.id}
              aria-label={t.label}
            >
              <t.icon className={`h-4 w-4 ${tab === t.id ? 'text-accent-foreground' : ''}`} />
              <span className="hidden md:inline">{t.label}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto py-6 px-4 sm:px-6 lg:px-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-foreground tracking-tight">
              {TABS.find(t => t.id === tab)?.label}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
            {tab === 'general' && 'Informações gerais do sistema.'}
              {tab === 'users' && 'Gerencie usuários e permissões.'}
              {tab === 'tags' && 'Crie e gerencie tags para organizar os formulários.'}
              {tab === 'integrations' && 'Configure integrações externas.'}
              {tab === 'pixels' && 'Configure pixels de rastreamento e webhooks para o Workflow.'}
              {tab === 'validations' && 'Consulte e gerencie validações de e-mail.'}
              {tab === 'security' && 'Políticas de segurança e sessões.'}
            </p>
          </div>

          {tab === 'general' && <GeneralTab />}
          {tab === 'users' && <UsersTab />}
          {tab === 'tags' && <TagsTab />}
          {tab === 'integrations' && <IntegrationsTab />}
          {tab === 'pixels' && <PixelIntegrationsCard />}
          {tab === 'validations' && <EmailValidationsTab />}
          {tab === 'security' && <SecurityTab />}
        </div>
      </div>
    </div>
  );
}

// ─── General Tab ───
function GeneralTab() {
  const { brand, saveBrand } = useBrand();
  const { toast } = useToast();
  const [draft, setDraft] = useState(brand);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(brand); }, [brand]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(brand);
  const canSave = Boolean(
    draft.productName.trim()
    && draft.ownerName.trim()
    && draft.description.trim()
  );

  const handleSave = useCallback(async () => {
    if (!canSave) {
      toast({
        title: 'Preencha todos os campos',
        description: 'Nome, proprietário e descrição não podem ficar vazios.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const saved = await saveBrand(draft);
      setDraft(saved);
      toast({ title: 'Identidade atualizada', description: 'O nome do sistema já foi aplicado.' });
    } catch (error) {
      toast({
        title: 'Não foi possível salvar',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [canSave, draft, saveBrand, toast]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold text-foreground">Informações do sistema</h2>
        <p className="text-xs text-muted-foreground">
          Essa identidade aparece no login, no cabeçalho e nos metadados gerais da aplicação.
        </p>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Nome do sistema</Label>
          <Input
            value={draft.productName}
            onChange={(event) => setDraft((current) => ({ ...current, productName: event.target.value }))}
            maxLength={80}
            disabled={saving}
            className="text-sm max-w-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Proprietário</Label>
          <Input
            value={draft.ownerName}
            onChange={(event) => setDraft((current) => ({ ...current, ownerName: event.target.value }))}
            maxLength={120}
            disabled={saving}
            className="text-sm max-w-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Descrição</Label>
          <Textarea
            value={draft.description}
            onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))}
            maxLength={320}
            disabled={saving}
            className="min-h-20 text-sm max-w-md resize-y"
          />
        </div>
        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <Button onClick={handleSave} disabled={saving || !dirty || !canSave}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salvar identidade
          </Button>
          {dirty && (
            <Button variant="ghost" onClick={() => setDraft(brand)} disabled={saving}>
              Descartar
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Users Tab ───
interface UserRow {
  user_id: string;
  display_name: string;
  email: string;
  is_active: boolean;
  created_at: string;
  role: 'admin' | 'user';
}

function UsersTab() {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user');

  const fetchUsers = useCallback(async () => {
    if (!isAdmin) {
      setUsers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const collected: UserRow[] = [];
      let afterCreatedAt: string | undefined;
      let afterUserId: string | undefined;
      const pageSize = 200;

      for (let page = 0; page < 500; page += 1) {
        const { data, error } = await supabase.rpc('get_admin_users', {
          p_after_created_at: afterCreatedAt,
          p_after_user_id: afterUserId,
          p_limit: pageSize,
        });
        if (error) throw error;

        const rows = data || [];
        for (const row of rows) {
          if (row.role !== 'admin' && row.role !== 'user') {
            throw new Error('Um usuário retornou sem papel confirmado.');
          }
          collected.push({ ...row, role: row.role });
        }
        if (rows.length < pageSize) break;

        const last = rows[rows.length - 1];
        if (!last || (last.created_at === afterCreatedAt && last.user_id === afterUserId)) {
          throw new Error('A paginação de usuários não avançou.');
        }
        afterCreatedAt = last.created_at;
        afterUserId = last.user_id;

        if (page === 499) throw new Error('O diretório excedeu o limite operacional de paginação.');
      }

      setUsers(collected);
    } catch (error: unknown) {
      setUsers([]);
      toast({
        title: 'Não foi possível carregar os usuários',
        description: error instanceof Error ? error.message : 'Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [isAdmin, toast]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleCreate = useCallback(async () => {
    if (!newEmail || newPassword.length < 12 || newPassword.length > 128) {
      toast({
        title: 'Revise os dados',
        description: 'Informe um e-mail e uma senha entre 12 e 128 caracteres.',
        variant: 'destructive',
      });
      return;
    }
    setCreating(true);
    try {
      const res = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: newEmail.trim(),
          password: newPassword,
          displayName: newName.trim(),
          role: newRole,
        },
      });
      if (res.error) throw new Error(await getFunctionErrorMessage(res.error));
      const result = res.data as { error?: string; success?: boolean } | null;
      if (result?.error || result?.success !== true) {
        throw new Error(result?.error || 'A criação do usuário não foi confirmada.');
      }

      toast({ title: 'Usuário criado', description: `${newEmail.trim()} foi adicionado.` });
      setNewEmail(''); setNewPassword(''); setNewName(''); setNewRole('user');
      setShowCreate(false);
      fetchUsers();
    } catch (error: unknown) {
      toast({
        title: 'Erro',
        description: error instanceof Error ? error.message : 'Não foi possível criar o usuário.',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  }, [newEmail, newPassword, newName, newRole, toast, fetchUsers]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <p className="text-sm font-medium text-foreground">Acesso restrito</p>
        <p className="mt-1 text-xs text-muted-foreground">Somente administradores podem consultar e gerenciar usuários.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{users.length} usuário(s) cadastrado(s)</p>
        {isAdmin && (
          <Button size="sm" onClick={() => setShowCreate(!showCreate)}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            Novo usuário
          </Button>
        )}
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          className="rounded-xl border border-border bg-card p-5 space-y-3 animate-fade-in"
          onSubmit={e => {
            e.preventDefault();
            void handleCreate();
          }}
        >
          <h3 className="text-sm font-semibold text-foreground">Criar novo usuário</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="new-user-name" className="text-xs text-muted-foreground">Nome</Label>
              <Input id="new-user-name" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome completo" maxLength={100} className="text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="new-user-role" className="text-xs text-muted-foreground">Papel</Label>
              <Select value={newRole} onValueChange={v => setNewRole(v as 'user' | 'admin')}>
                <SelectTrigger id="new-user-role" className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="user">Usuário</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-user-email" className="text-xs text-muted-foreground">Email</Label>
            <Input id="new-user-email" type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@exemplo.com" required maxLength={254} className="text-sm" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-user-password" className="text-xs text-muted-foreground">Senha</Label>
            <Input id="new-user-password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Entre 12 e 128 caracteres" required minLength={12} maxLength={128} className="text-sm" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" size="sm" disabled={creating || !newEmail || newPassword.length < 12 || newPassword.length > 128}>
              {creating && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Criar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowCreate(false)}>Cancelar</Button>
          </div>
        </form>
      )}

      {/* User list */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Usuário</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Papel</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
              <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Criado em</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.user_id} className="border-b border-border last:border-0 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                      {(u.display_name || u.email || '?')[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-foreground">{u.display_name || '—'}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded ${
                    u.role === 'admin' ? 'bg-accent text-accent-foreground' : 'bg-muted text-muted-foreground'
                  }`}>
                    {u.role === 'admin' ? 'Admin' : 'Usuário'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1.5 text-xs ${u.is_active ? 'text-success' : 'text-destructive'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${u.is_active ? 'bg-success' : 'bg-destructive'}`} />
                    {u.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {new Date(u.created_at).toLocaleDateString('pt-BR')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Integrations Tab ───

interface IntegrationCardDef {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  bgColor: string;
}

const INTEGRATION_CARDS: IntegrationCardDef[] = [
  {
    id: 'minio',
    label: 'MinIO S3',
    description: 'Armazenamento de arquivos compatível com S3',
    icon: <HardDrive className="h-5 w-5 text-node-integration-accent" />,
    bgColor: 'bg-node-integration',
  },
  {
    id: 'google',
    label: 'Google OAuth2',
    description: 'Google Sheets, Drive e mais',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
    ),
    bgColor: 'bg-blue-500/10',
  },
  {
    id: 'reoon',
    label: 'Reoon Email Verifier',
    description: 'Validação de e-mails em tempo real',
    icon: <Mail className="h-5 w-5 text-blue-500" />,
    bgColor: 'bg-blue-500/10',
  },
  {
    id: 'pixels',
    label: 'Pixels & Webhooks',
    description: 'Meta, GA4, TikTok, LinkedIn e Webhooks',
    icon: <BarChart3 className="h-5 w-5 text-orange-500" />,
    bgColor: 'bg-orange-500/10',
  },
  {
    id: 'evolution',
    label: 'WhatsApp (Evolution API)',
    description: 'Enviar mensagens no workflow',
    icon: <MessageSquare className="h-5 w-5 text-node-whatsapp-accent" />,
    bgColor: 'bg-node-whatsapp',
  },
  {
    id: 'resend',
    label: 'E-mail (Resend)',
    description: 'Enviar e-mails transacionais no workflow',
    icon: <Mail className="h-5 w-5 text-node-email-accent" />,
    bgColor: 'bg-node-email',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'Análise de sentimentos e emoções com IA',
    icon: <Brain className="h-5 w-5 text-violet-500" />,
    bgColor: 'bg-violet-500/10',
  },
];

function IntegrationsTab() {
  const [openDialog, setOpenDialog] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {INTEGRATION_CARDS.map(card => (
          <button
            key={card.id}
            onClick={() => setOpenDialog(card.id)}
            className="group rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/30 hover:shadow-md hover:shadow-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <div className="flex items-start gap-3">
              <div className={`h-10 w-10 rounded-lg ${card.bgColor} flex items-center justify-center flex-shrink-0`}>
                {card.icon}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-foreground group-hover:text-foreground transition-colors">
                  {card.label}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {card.description}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-foreground/60 transition-colors mt-0.5 flex-shrink-0" />
            </div>
          </button>
        ))}
      </div>

      {/* MinIO Dialog */}
      <Dialog open={openDialog === 'minio'} onOpenChange={open => !open && setOpenDialog(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-node-integration flex items-center justify-center">
                <HardDrive className="h-4 w-4 text-node-integration-accent" />
              </div>
              MinIO S3
            </DialogTitle>
          </DialogHeader>
          <MinioForm />
        </DialogContent>
      </Dialog>

      {/* Google OAuth Dialog */}
      <Dialog open={openDialog === 'google'} onOpenChange={open => !open && setOpenDialog(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <GoogleOAuthCard />
        </DialogContent>
      </Dialog>

      {/* Reoon Dialog */}
      <Dialog open={openDialog === 'reoon'} onOpenChange={open => !open && setOpenDialog(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <ReoonIntegrationCard />
        </DialogContent>
      </Dialog>

      {/* Pixels Dialog */}
      <Dialog open={openDialog === 'pixels'} onOpenChange={open => !open && setOpenDialog(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <PixelIntegrationsCard />
        </DialogContent>
      </Dialog>

      {/* Evolution API Dialog */}
      <Dialog open={openDialog === 'evolution'} onOpenChange={open => !open && setOpenDialog(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <EvolutionApiCard />
        </DialogContent>
      </Dialog>

      {/* Resend Dialog */}
      <Dialog open={openDialog === 'resend'} onOpenChange={open => !open && setOpenDialog(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <ResendApiCard />
        </DialogContent>
      </Dialog>

      {/* OpenAI Dialog */}
      <Dialog open={openDialog === 'openai'} onOpenChange={open => !open && setOpenDialog(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
                <Brain className="h-4 w-4 text-violet-500" />
              </div>
              OpenAI
            </DialogTitle>
          </DialogHeader>
          <OpenAIIntegrationCard />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Extracted MinIO form (was inline in IntegrationsTab)
interface MinioConfig {
  endpoint: string;
  port: string;
  accessKey: string;
  secretKey: string;
  bucket: string;
  useSSL: boolean;
  region: string;
}

const EMPTY_MINIO: MinioConfig = {
  endpoint: '', port: '9000', accessKey: '', secretKey: '',
  bucket: '', useSSL: true, region: 'us-east-1',
};

function MinioForm() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [config, setConfig] = useState<MinioConfig>(EMPTY_MINIO);
  const isComplete = Boolean(config.endpoint && config.accessKey && config.secretKey && config.bucket);
  const operationInProgress = saving || testing;

  useEffect(() => {
    listIntegrationSettings('minio_s3')
      .then((rows) => {
        const data = rows[0];
        if (data) {
          setSettingsId(data.id);
          setIsActive(data.is_active);
          const cfg = data.config as any;
          setConfig({
            endpoint: cfg.endpoint || '', port: cfg.port || '9000',
            accessKey: cfg.accessKey || '', secretKey: cfg.secretKey || '',
            bucket: cfg.bucket || '', useSSL: true,
            region: cfg.region || 'us-east-1',
          });
        }
      })
      .catch((error: Error) => {
        toast({
          title: 'Erro ao carregar MinIO',
          description: error.message || 'Não foi possível carregar a configuração.',
          variant: 'destructive',
        });
      })
      .finally(() => setLoading(false));
  }, [toast]);

  const updateConfig = useCallback((patch: Partial<MinioConfig>) => {
    setConfig(prev => ({ ...prev, ...patch }));
    setTestResult(null);
  }, []);

  const handleSave = useCallback(async () => {
    if (isActive && !isComplete) {
      toast({
        title: 'Configuração incompleta',
        description: 'Preencha endpoint, access key, secret key e bucket antes de ativar o MinIO.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const row = await saveIntegrationSetting({
        id: settingsId,
        integrationType: 'minio_s3',
        label: 'MinIO S3',
        config: { ...config, useSSL: true },
        isActive,
      });
      setSettingsId(row.id);
      setConfig(prev => ({ ...prev, ...row.config } as MinioConfig));
      toast({
        title: isActive ? 'Salvo e validado' : 'Salvo desativado',
        description: 'Configuração do MinIO salva.',
      });
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar MinIO',
        description: error?.message || 'Não foi possível salvar a configuração.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  }, [config, isActive, isComplete, settingsId, toast]);

  const handleTest = useCallback(async () => {
    setTesting(true); setTestResult(null);
    try {
      const credentials = {
        ...config,
        useSSL: true,
        accessKey: config.accessKey === MASKED_INTEGRATION_SECRET ? undefined : config.accessKey,
        secretKey: config.secretKey === MASKED_INTEGRATION_SECRET ? undefined : config.secretKey,
      };
      const res = await withIntegrationTimeout(
        supabase.functions.invoke('minio-test', {
          body: { settingsId, config: credentials },
        }),
      );
      const data = res.data as any;
      if (res.error) throw res.error;
      setTestResult(data?.success ? 'success' : 'error');
      toast({ title: data?.success ? 'Conexão OK' : 'Falha', description: data?.message, variant: data?.success ? 'default' : 'destructive' });
    } catch (error: any) {
      setTestResult('error');
      toast({ title: 'Erro', description: error?.message || 'Falha ao testar.', variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  }, [config, settingsId, toast]);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Switch
          checked={isActive}
          disabled={operationInProgress}
          onCheckedChange={(active) => {
            if (active && !isComplete) {
              toast({
                title: 'Configuração incompleta',
                description: 'Preencha os campos obrigatórios antes de ativar.',
                variant: 'destructive',
              });
              return;
            }
            setIsActive(active);
          }}
        />
        <Label className="text-sm">Ativo</Label>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Endpoint</Label>
          <Input value={config.endpoint} onChange={e => updateConfig({ endpoint: e.target.value })} placeholder="minio.exemplo.com" className="text-sm" disabled={operationInProgress} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Porta</Label>
          <Input value={config.port} onChange={e => updateConfig({ port: e.target.value })} placeholder="9000" className="text-sm" disabled={operationInProgress} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Access Key</Label>
        <Input value={config.accessKey} onChange={e => updateConfig({ accessKey: e.target.value })} placeholder="minioadmin" className="text-sm font-mono" disabled={operationInProgress} />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">Secret Key</Label>
        <div className="relative">
          <Input type={showSecret ? 'text' : 'password'} value={config.secretKey} onChange={e => updateConfig({ secretKey: e.target.value })} placeholder="••••••••" className="text-sm font-mono pr-10" disabled={operationInProgress} />
          <button type="button" onClick={() => setShowSecret(!showSecret)} disabled={operationInProgress} aria-label={showSecret ? 'Ocultar secret key' : 'Mostrar secret key'} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-50">
            {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Bucket</Label>
          <Input value={config.bucket} onChange={e => updateConfig({ bucket: e.target.value })} placeholder="form-uploads" className="text-sm" disabled={operationInProgress} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Região</Label>
          <Input value={config.region} onChange={e => updateConfig({ region: e.target.value })} placeholder="us-east-1" className="text-sm" disabled={operationInProgress} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Switch checked disabled id="ssl" />
        <Label htmlFor="ssl" className="text-xs text-muted-foreground">HTTPS obrigatório em produção</Label>
      </div>
      <div className="flex items-center gap-2 pt-2 border-t border-border">
        <Button variant="outline" size="sm" onClick={handleTest} disabled={operationInProgress || !isComplete}>
          {testing ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <TestTube className="mr-2 h-3.5 w-3.5" />}
          Testar
          {testResult === 'success' && <CheckCircle2 className="ml-2 h-3.5 w-3.5 text-success" />}
          {testResult === 'error' && <XCircle className="ml-2 h-3.5 w-3.5 text-destructive" />}
        </Button>
        <Button size="sm" onClick={handleSave} disabled={operationInProgress}>
          {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
          Salvar
        </Button>
      </div>
    </div>
  );
}

// ─── Tags Tab ───
const TAG_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316',
  '#eab308', '#22c55e', '#14b8a6', '#0ea5e9', '#64748b',
];

function TagsTab() {
  const { tags, loading, createTag, updateTag, deleteTag } = useTags();
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(TAG_COLORS[0]);
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    await createTag(newName, newColor);
    setNewName('');
    setNewColor(TAG_COLORS[0]);
    setCreating(false);
  };

  const startEdit = (tag: { id: string; name: string; color: string }) => {
    setEditId(tag.id);
    setEditName(tag.name);
    setEditColor(tag.color);
  };

  const confirmEdit = async () => {
    if (!editId || !editName.trim()) return;
    await updateTag(editId, { name: editName.trim(), color: editColor });
    setEditId(null);
  };

  return (
    <div className="space-y-6">
      {/* Create */}
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold text-foreground">Nova tag</h2>
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <Label className="text-xs text-muted-foreground">Nome</Label>
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Ex: Prioridade alta"
              className="text-sm"
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Cor</Label>
            <div className="flex items-center gap-1.5">
              {TAG_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setNewColor(c)}
                  className={`w-6 h-6 rounded-full transition-transform ${newColor === c ? 'scale-125 ring-2 ring-offset-1 ring-border' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <Button size="sm" onClick={handleCreate} disabled={creating || !newName.trim()}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
            Criar
          </Button>
        </div>
        {/* Preview */}
        {newName && (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs text-muted-foreground">Prévia:</span>
            <span
              className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
              style={{ backgroundColor: `${newColor}20`, color: newColor }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: newColor }} />
              {newName}
            </span>
          </div>
        )}
      </div>

      {/* List */}
      <div className="rounded-xl border border-border bg-card">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Tags criadas</h2>
          <span className="text-xs text-muted-foreground">{tags.length} tag{tags.length !== 1 ? 's' : ''}</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : tags.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <Tag className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhuma tag criada ainda</p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {tags.map(tag => (
              <li key={tag.id} className="flex items-center gap-3 px-4 py-3">
                {editId === tag.id ? (
                  <>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {TAG_COLORS.map(c => (
                        <button
                          key={c}
                          onClick={() => setEditColor(c)}
                          className={`w-5 h-5 rounded-full transition-transform ${editColor === c ? 'scale-125 ring-2 ring-offset-1 ring-border' : 'hover:scale-110'}`}
                          style={{ backgroundColor: c }}
                        />
                      ))}
                    </div>
                    <Input
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="h-7 text-xs flex-1"
                      autoFocus
                      onKeyDown={e => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') setEditId(null); }}
                    />
                    <button onClick={confirmEdit} className="p-1 text-primary hover:text-primary/80"><Check className="h-4 w-4" /></button>
                    <button onClick={() => setEditId(null)} className="p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
                  </>
                ) : (
                  <>
                    <span
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0"
                      style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                      {tag.name}
                    </span>
                    <span className="flex-1 text-xs text-muted-foreground">{tag.created_at ? new Date(tag.created_at).toLocaleDateString('pt-BR') : ''}</span>
                    <button onClick={() => startEdit(tag)} className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => deleteTag(tag.id)} className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ─── Security Tab ───
function SecurityTab() {
  const policies = [
    ['Cadastro público', 'Desativado; novas contas passam pelo administrador.'],
    ['Senha', 'Entre 12 e 128 caracteres.'],
    ['Confirmação de e-mail', 'Obrigatória antes do primeiro acesso.'],
    ['Alteração de senha', 'Exige uma sessão segura recente.'],
    ['Código por e-mail', '8 dígitos, com validade de 60 minutos.'],
    ['MFA', 'TOTP disponível para cadastro e verificação.'],
  ] as const;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Políticas aplicadas</h2>
          <p className="mt-1 text-xs text-muted-foreground">Estado efetivo desta release no Supabase. Esta tela é somente leitura.</p>
        </div>
        <div className="divide-y divide-border rounded-lg border border-border">
          {policies.map(([title, description]) => (
            <div key={title} className="flex items-start gap-3 px-4 py-3">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold text-foreground">Sessões</h2>
        <p className="text-sm text-foreground">Gerenciadas pelo Supabase Auth</p>
        <p className="text-xs text-muted-foreground">Expiração e revogação são políticas do ambiente e não podem ser simuladas por um controle local.</p>
      </div>
    </div>
  );
}
