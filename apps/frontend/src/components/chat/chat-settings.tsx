'use client';

import { memo, useCallback, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  Camera,
  Check,
  Copy,
  Eye,
  EyeOff,
  Link,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AgentAvatar } from '@/components/shared/agent-avatar';
import { api } from '@/lib/api';
import { useAgentsContext } from '@/lib/contexts/agents-context';

interface ChatSettingsProps {
  agentId: string;
  name: string;
  avatarUrl?: string | null;
  webhookUrl?: string | null;
  webhookHeaders?: Record<string, string> | null;
  webhookAuth?: { username: string; password: string } | null;
}

export const ChatSettings = memo(function ChatSettings({
  agentId,
  name,
  avatarUrl,
  webhookUrl,
  webhookHeaders: initialHeaders,
  webhookAuth: initialAuth,
}: ChatSettingsProps) {
  const router = useRouter();
  const { refetch } = useAgentsContext();

  // Chat name
  const [editName, setEditName] = useState(name);
  const [savingName, setSavingName] = useState(false);
  const nameChanged = editName.trim() !== name && editName.trim().length > 0;

  const handleSaveName = useCallback(async () => {
    if (savingName || !nameChanged) return;
    try {
      setSavingName(true);
      await api(`/api/agents/${agentId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editName.trim() }),
      });
      void refetch();
    } catch {
      // silently fail
    } finally {
      setSavingName(false);
    }
  }, [savingName, nameChanged, agentId, editName, refetch]);

  // Copy ID
  const [copied, setCopied] = useState(false);
  const handleCopyId = useCallback(() => {
    void navigator.clipboard.writeText(agentId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [agentId]);

  // Avatar
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [removingAvatar, setRemovingAvatar] = useState(false);

  const handleAvatarUpload = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || uploadingAvatar) return;
      try {
        setUploadingAvatar(true);
        const formData = new FormData();
        formData.append('file', file);
        await api(`/api/agents/${agentId}/avatar`, {
          method: 'POST',
          body: formData,
        });
        void refetch();
      } catch {
        // silently fail
      } finally {
        setUploadingAvatar(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    },
    [uploadingAvatar, agentId, refetch],
  );

  const handleRemoveAvatar = useCallback(async () => {
    if (removingAvatar) return;
    try {
      setRemovingAvatar(true);
      await api(`/api/agents/${agentId}/avatar`, { method: 'DELETE' });
      void refetch();
    } catch {
      // silently fail
    } finally {
      setRemovingAvatar(false);
    }
  }, [removingAvatar, agentId, refetch]);

  // Webhook
  const [hookUrl, setHookUrl] = useState(webhookUrl ?? '');
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>(
    initialHeaders ? Object.entries(initialHeaders).map(([key, value]) => ({ key, value })) : [],
  );
  const [authUser, setAuthUser] = useState(initialAuth?.username ?? '');
  const [authPass, setAuthPass] = useState(initialAuth?.password ?? '');
  const [showPass, setShowPass] = useState(false);
  const [savingHook, setSavingHook] = useState(false);
  const [hookError, setHookError] = useState<string | null>(null);
  const [hookSuccess, setHookSuccess] = useState(false);

  const addHeader = useCallback(() => {
    setHeaders((prev) => [...prev, { key: '', value: '' }]);
  }, []);

  const removeHeader = useCallback((index: number) => {
    setHeaders((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateHeader = useCallback((index: number, field: 'key' | 'value', val: string) => {
    setHeaders((prev) => prev.map((h, i) => (i === index ? { ...h, [field]: val } : h)));
  }, []);

  const handleSaveWebhook = useCallback(async () => {
    if (savingHook) return;
    try {
      setSavingHook(true);
      setHookError(null);
      setHookSuccess(false);

      const headerObj: Record<string, string> = {};
      for (const h of headers) {
        if (h.key.trim()) headerObj[h.key.trim()] = h.value;
      }

      const payload: Record<string, unknown> = {
        webhookUrl: hookUrl.trim() || null,
        webhookHeaders: Object.keys(headerObj).length > 0 ? headerObj : null,
        webhookAuth: authUser.trim() ? { username: authUser.trim(), password: authPass } : null,
      };

      await api(`/api/agents/${agentId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      void refetch();
      setHookSuccess(true);
      setTimeout(() => setHookSuccess(false), 3000);
    } catch (err) {
      setHookError(err instanceof Error ? err.message : 'Failed to save webhook config');
    } finally {
      setSavingHook(false);
    }
  }, [savingHook, hookUrl, headers, authUser, authPass, agentId, refetch]);

  // Delete
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = useCallback(async () => {
    if (deleting) return;
    try {
      setDeleting(true);
      await api(`/api/agents/${agentId}`, { method: 'DELETE' });
      void refetch();
      router.push('/chats');
    } catch {
      setDeleting(false);
    }
  }, [deleting, agentId, refetch, router]);

  return (
    <div className="flex-1 overflow-y-auto scrollbar-hide">
      <div className="max-w-lg mx-auto p-6 space-y-4">
        {/* General */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Pencil size={16} className="text-muted-foreground" />
              General
            </CardTitle>
            <CardDescription>Change the avatar, chat name or copy the chat ID.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Avatar</label>
              <div className="flex items-center gap-3">
                <div className="relative group">
                  <AgentAvatar name={name} avatarUrl={avatarUrl} size="lg" />
                  <button
                    type="button"
                    className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                  >
                    {uploadingAvatar ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : (
                      <Camera size={18} />
                    )}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => void handleAvatarUpload(e)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-lg text-xs h-7"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                  >
                    {uploadingAvatar ? <Loader2 size={12} className="animate-spin mr-1" /> : null}
                    Upload
                  </Button>
                  {avatarUrl && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="rounded-lg text-xs h-7 text-muted-foreground hover:text-destructive"
                      onClick={() => void handleRemoveAvatar()}
                      disabled={removingAvatar}
                    >
                      {removingAvatar ? (
                        <Loader2 size={12} className="animate-spin mr-1" />
                      ) : (
                        <X size={12} className="mr-1" />
                      )}
                      Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Chat Name</label>
              <div className="flex items-center gap-2">
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="rounded-lg text-sm"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void handleSaveName();
                  }}
                />
                <Button
                  size="sm"
                  className="shrink-0 rounded-lg"
                  disabled={savingName || !nameChanged}
                  onClick={() => void handleSaveName()}
                >
                  {savingName ? <Loader2 size={14} className="animate-spin" /> : 'Save'}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Chat ID</label>
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs font-mono text-foreground truncate">
                  {agentId}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 rounded-lg gap-1.5"
                  onClick={handleCopyId}
                >
                  {copied ? (
                    <>
                      <Check size={14} className="text-success-foreground" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy size={14} />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Webhook */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Link size={16} className="text-muted-foreground" />
              Webhook
            </CardTitle>
            <CardDescription>
              When a user sends a message in this chat, a POST request will be sent to the
              configured URL.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* URL */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Webhook URL</label>
              <Input
                placeholder="https://your-server.com/webhook"
                value={hookUrl}
                onChange={(e) => setHookUrl(e.target.value)}
                className="rounded-lg text-sm font-mono"
              />
            </div>

            {/* Custom Headers */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">Custom Headers</label>
                <Button variant="ghost" size="sm" className="text-xs gap-1 h-7" onClick={addHeader}>
                  <Plus size={12} />
                  Add
                </Button>
              </div>
              {headers.length === 0 && (
                <p className="text-xs text-muted-foreground">No custom headers configured.</p>
              )}
              {headers.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder="Header name"
                    value={h.key}
                    onChange={(e) => updateHeader(i, 'key', e.target.value)}
                    className="rounded-lg text-sm flex-1"
                  />
                  <Input
                    placeholder="Value"
                    value={h.value}
                    onChange={(e) => updateHeader(i, 'value', e.target.value)}
                    className="rounded-lg text-sm flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:text-error-foreground"
                    onClick={() => removeHeader(i)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              ))}
            </div>

            {/* Basic Auth */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-muted-foreground">
                Basic Authentication
              </label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Username"
                  value={authUser}
                  onChange={(e) => setAuthUser(e.target.value)}
                  className="rounded-lg text-sm"
                />
                <div className="relative">
                  <Input
                    type={showPass ? 'text' : 'password'}
                    placeholder="Password"
                    value={authPass}
                    onChange={(e) => setAuthPass(e.target.value)}
                    className="rounded-lg text-sm pr-9"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setShowPass((v) => !v)}
                  >
                    {showPass ? <EyeOff size={14} /> : <Eye size={14} />}
                  </Button>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Credentials are sent as an{' '}
                <code className="bg-muted px-1 py-0.5 rounded text-xs">Authorization: Basic</code>{' '}
                header.
              </p>
            </div>

            {hookError && (
              <div className="flex items-center gap-2 text-sm text-error-foreground bg-error-muted rounded-lg px-3 py-2">
                <AlertCircle size={14} />
                {hookError}
              </div>
            )}

            {hookSuccess && (
              <p className="text-xs text-success-foreground">Webhook configuration saved.</p>
            )}

            <Button
              size="sm"
              className="rounded-lg w-full"
              onClick={() => void handleSaveWebhook()}
              disabled={savingHook}
            >
              {savingHook ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}
              Save Webhook
            </Button>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <Trash2 size={16} />
              Danger Zone
            </CardTitle>
            <CardDescription>
              Permanently delete this chat and all its messages. This cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!confirmDelete ? (
              <Button
                variant="destructive"
                size="sm"
                className="rounded-lg"
                onClick={() => setConfirmDelete(true)}
              >
                Delete Chat
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  className="rounded-lg"
                  disabled={deleting}
                  onClick={() => void handleDelete()}
                >
                  {deleting ? <Loader2 size={14} className="animate-spin mr-1.5" /> : null}
                  Yes, delete permanently
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-lg"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
});
