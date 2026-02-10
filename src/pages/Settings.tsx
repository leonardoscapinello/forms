import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import {
  HardDrive, Save, TestTube, Loader2, CheckCircle2, XCircle, Eye, EyeOff,
  Settings2, Users, Plug, Shield, Plus, Trash2, UserCog, Mail,
} from 'lucide-react';
import ReoonIntegrationCard from '@/components/settings/ReoonIntegrationCard';
import EmailValidationsTab from '@/components/settings/EmailValidationsTab';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// ─── Tab navigation ───
const TABS = [
  { id: 'general', label: 'Geral', icon: Settings2 },
  { id: 'users', label: 'Usuários', icon: Users },
  { id: 'integrations', label: 'Integrações', icon: Plug },
  { id: 'validations', label: 'Validações', icon: Mail },
  { id: 'security', label: 'Segurança', icon: Shield },
] as const;

type TabId = typeof TABS[number]['id'];

export default function Settings() {
  const [tab, setTab] = useState<TabId>('general');

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      {/* Sidebar */}
      <aside className="w-56 shrink-0 border-r border-border bg-muted/30 py-6 px-3 space-y-1">
        <h1 className="text-sm font-semibold text-foreground tracking-tight px-3 mb-4">Configurações</h1>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.id
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </aside>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto py-8 px-8">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-foreground tracking-tight">
              {TABS.find(t => t.id === tab)?.label}
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              {tab === 'general' && 'Informações gerais do sistema.'}
              {tab === 'users' && 'Gerencie usuários e permissões.'}
              {tab === 'integrations' && 'Configure integrações externas.'}
              {tab === 'validations' && 'Consulte e gerencie validações de e-mail.'}
              {tab === 'security' && 'Políticas de segurança e sessões.'}
            </p>
          </div>

          {tab === 'general' && <GeneralTab />}
          {tab === 'users' && <UsersTab />}
          {tab === 'integrations' && <IntegrationsTab />}
          {tab === 'validations' && <EmailValidationsTab />}
          {tab === 'security' && <SecurityTab />}
        </div>
      </div>
    </div>
  );
}

// ─── General Tab ───
function GeneralTab() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold text-foreground">Informações do sistema</h2>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Nome do sistema</Label>
          <Input defaultValue="FormFlow" className="text-sm max-w-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Descrição</Label>
          <Input defaultValue="Sistema de formulários e quizzes" className="text-sm max-w-md" />
        </div>
        <Button size="sm" disabled>
          <Save className="mr-2 h-3.5 w-3.5" />
          Salvar
        </Button>
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
  role?: string;
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
    const { data: profiles } = await supabase.from('profiles').select('*');
    const { data: roles } = await supabase.from('user_roles').select('user_id, role');

    const roleMap = new Map((roles || []).map(r => [r.user_id, r.role]));
    const merged = (profiles || []).map(p => ({
      ...p,
      role: roleMap.get(p.user_id) || 'user',
    }));

    setUsers(merged);
    setLoading(false);
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleCreate = useCallback(async () => {
    if (!newEmail || !newPassword) return;
    setCreating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await supabase.functions.invoke('admin-create-user', {
        body: { email: newEmail, password: newPassword, displayName: newName, role: newRole },
      });
      if (res.error) throw new Error(res.error.message);
      const result = res.data as any;
      if (result?.error) throw new Error(result.error);

      toast({ title: 'Usuário criado', description: `${newEmail} foi adicionado.` });
      setNewEmail(''); setNewPassword(''); setNewName(''); setNewRole('user');
      setShowCreate(false);
      fetchUsers();
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message, variant: 'destructive' });
    } finally {
      setCreating(false);
    }
  }, [newEmail, newPassword, newName, newRole, toast, fetchUsers]);

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
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
        <div className="rounded-xl border border-border bg-card p-5 space-y-3 animate-fade-in">
          <h3 className="text-sm font-semibold text-foreground">Criar novo usuário</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Nome</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nome completo" className="text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Papel</Label>
              <Select value={newRole} onValueChange={v => setNewRole(v as 'user' | 'admin')}>
                <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  <SelectItem value="user">Usuário</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Email</Label>
            <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@exemplo.com" className="text-sm" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Senha</Label>
            <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="text-sm" />
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={handleCreate} disabled={creating || !newEmail || !newPassword}>
              {creating && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Criar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>Cancelar</Button>
          </div>
        </div>
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
                    u.role === 'admin' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
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

function IntegrationsTab() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [config, setConfig] = useState<MinioConfig>(EMPTY_MINIO);

  useEffect(() => {
    supabase.from('integration_settings').select('*').eq('integration_type', 'minio_s3').maybeSingle()
      .then(({ data }) => {
        if (data) {
          setSettingsId(data.id);
          setIsActive(data.is_active);
          const cfg = data.config as any;
          setConfig({
            endpoint: cfg.endpoint || '', port: cfg.port || '9000',
            accessKey: cfg.accessKey || '', secretKey: cfg.secretKey || '',
            bucket: cfg.bucket || '', useSSL: cfg.useSSL ?? true,
            region: cfg.region || 'us-east-1',
          });
        }
        setLoading(false);
      });
  }, []);

  const updateConfig = useCallback((patch: Partial<MinioConfig>) => {
    setConfig(prev => ({ ...prev, ...patch }));
    setTestResult(null);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const payload = { integration_type: 'minio_s3', label: 'MinIO S3', config: config as any, is_active: isActive };
    if (settingsId) {
      await supabase.from('integration_settings').update(payload).eq('id', settingsId);
    } else {
      const { data } = await supabase.from('integration_settings').insert(payload).select().single();
      if (data) setSettingsId(data.id);
    }
    toast({ title: 'Salvo', description: 'Configuração do MinIO salva.' });
    setSaving(false);
  }, [config, isActive, settingsId, toast]);

  const handleTest = useCallback(async () => {
    setTesting(true); setTestResult(null);
    try {
      const res = await supabase.functions.invoke('minio-test', { body: { config } });
      const data = res.data as any;
      setTestResult(data?.success ? 'success' : 'error');
      toast({ title: data?.success ? 'Conexão OK' : 'Falha', description: data?.message, variant: data?.success ? 'default' : 'destructive' });
    } catch {
      setTestResult('error');
      toast({ title: 'Erro', description: 'Falha ao testar.', variant: 'destructive' });
    }
    setTesting(false);
  }, [config, toast]);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-6">
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-node-integration flex items-center justify-center">
            <HardDrive className="h-5 w-5 text-node-integration-accent" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">MinIO S3</h2>
            <p className="text-xs text-muted-foreground">Armazenamento de arquivos compatível com S3</p>
          </div>
        </div>
        <Switch checked={isActive} onCheckedChange={setIsActive} />
      </div>

      <div className="p-6 space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Endpoint</Label>
            <Input value={config.endpoint} onChange={e => updateConfig({ endpoint: e.target.value })} placeholder="minio.exemplo.com" className="text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Porta</Label>
            <Input value={config.port} onChange={e => updateConfig({ port: e.target.value })} placeholder="9000" className="text-sm w-28" />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Access Key</Label>
          <Input value={config.accessKey} onChange={e => updateConfig({ accessKey: e.target.value })} placeholder="minioadmin" className="text-sm font-mono" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Secret Key</Label>
          <div className="relative">
            <Input type={showSecret ? 'text' : 'password'} value={config.secretKey} onChange={e => updateConfig({ secretKey: e.target.value })} placeholder="••••••••" className="text-sm font-mono pr-10" />
            <button type="button" onClick={() => setShowSecret(!showSecret)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Bucket</Label>
            <Input value={config.bucket} onChange={e => updateConfig({ bucket: e.target.value })} placeholder="form-uploads" className="text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Região</Label>
            <Input value={config.region} onChange={e => updateConfig({ region: e.target.value })} placeholder="us-east-1" className="text-sm" />
          </div>
        </div>
        <div className="flex items-center gap-2 pt-2">
          <Switch checked={config.useSSL} onCheckedChange={v => updateConfig({ useSSL: v })} id="ssl" />
          <Label htmlFor="ssl" className="text-xs text-muted-foreground cursor-pointer">Usar SSL (HTTPS)</Label>
        </div>
      </div>

      <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-muted/30 rounded-b-xl">
        <Button variant="outline" size="sm" onClick={handleTest} disabled={testing || !config.endpoint}>
          {testing ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <TestTube className="mr-2 h-3.5 w-3.5" />}
          Testar conexão
          {testResult === 'success' && <CheckCircle2 className="ml-2 h-3.5 w-3.5 text-success" />}
          {testResult === 'error' && <XCircle className="ml-2 h-3.5 w-3.5 text-destructive" />}
        </Button>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
          Salvar
        </Button>
      </div>
    </div>

    <ReoonIntegrationCard />
    </div>
  );
}

// ─── Security Tab ───
function SecurityTab() {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold text-foreground">Política de senhas</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Mínimo de 8 caracteres</p>
              <p className="text-xs text-muted-foreground">Exigir senhas com pelo menos 8 caracteres</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Exigir caractere especial</p>
              <p className="text-xs text-muted-foreground">Pelo menos um caractere especial (!@#$...)</p>
            </div>
            <Switch />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Exigir número</p>
              <p className="text-xs text-muted-foreground">Pelo menos um número na senha</p>
            </div>
            <Switch defaultChecked />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold text-foreground">Sessões</h2>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Tempo de expiração da sessão (horas)</Label>
          <Input type="number" defaultValue={24} className="text-sm w-28" />
        </div>
        <Button size="sm" disabled>
          <Save className="mr-2 h-3.5 w-3.5" />
          Salvar
        </Button>
      </div>
    </div>
  );
}
