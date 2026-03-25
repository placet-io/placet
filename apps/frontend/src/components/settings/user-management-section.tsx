'use client';

import { memo, useCallback, useEffect, useState } from 'react';
import { Users, Plus, Trash2, Loader2, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { AgentAvatar } from '@/components/shared/agent-avatar';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import type { User } from '@humanproxy/shared';

export const UserManagementSection = memo(function UserManagementSection() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviting, setInviting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      const data = await api<User[]>('/api/users');
      setUsers(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  const handleInvite = useCallback(async () => {
    if (inviting || !inviteEmail || !inviteName || !invitePassword) return;
    try {
      setInviting(true);
      setError(null);
      await api('/api/users', {
        method: 'POST',
        body: JSON.stringify({
          email: inviteEmail,
          displayName: inviteName,
          password: invitePassword,
          role: 'member',
        }),
      });
      setInviteEmail('');
      setInviteName('');
      setInvitePassword('');
      setShowInvite(false);
      void fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    } finally {
      setInviting(false);
    }
  }, [inviting, inviteEmail, inviteName, invitePassword, fetchUsers]);

  const handleDelete = useCallback(
    async (id: string) => {
      if (deletingId) return;
      try {
        setDeletingId(id);
        setError(null);
        await api(`/api/users/${id}`, { method: 'DELETE' });
        setUsers((prev) => prev.filter((u) => u.id !== id));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete user');
      } finally {
        setDeletingId(null);
      }
    },
    [deletingId],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 pb-4 border-b border-border">
        <Users className="text-muted-foreground" size={24} />
        <h2 className="text-xl font-semibold text-foreground">User Management</h2>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-sm text-red-500 bg-red-500/10 rounded-lg px-4 py-2">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <Card className="rounded-2xl">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="font-semibold text-foreground">Team Members</h3>
              <p className="text-sm text-muted-foreground">Manage who has access to HumanProxy.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setShowInvite(true)}>
              <Plus size={16} className="mr-1" />
              Invite User
            </Button>
          </div>

          {showInvite && (
            <div className="mb-6 p-4 bg-muted/30 rounded-xl border border-border space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="invite-name" className="text-xs">
                    Display Name
                  </Label>
                  <Input
                    id="invite-name"
                    placeholder="John Doe"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    className="rounded-xl h-9"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="invite-email" className="text-xs">
                    Email
                  </Label>
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="john@example.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="rounded-xl h-9"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="invite-password" className="text-xs">
                  Initial Password
                </Label>
                <Input
                  id="invite-password"
                  type="password"
                  placeholder="Min. 8 characters"
                  value={invitePassword}
                  onChange={(e) => setInvitePassword(e.target.value)}
                  className="rounded-xl h-9"
                />
                <p className="text-xs text-muted-foreground">
                  User will be prompted to change this on first login.
                </p>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  className="rounded-xl"
                  onClick={() => void handleInvite()}
                  disabled={inviting || !inviteEmail || !inviteName || !invitePassword}
                >
                  {inviting ? <Loader2 size={16} className="animate-spin mr-1" /> : null}
                  Create User
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowInvite(false);
                    setInviteEmail('');
                    setInviteName('');
                    setInvitePassword('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No users found.</p>
          ) : (
            <div className="space-y-3">
              {users.map((user) => (
                <div
                  key={user.id}
                  className="flex items-center justify-between p-4 bg-background rounded-xl border border-border"
                >
                  <div className="flex items-center gap-3">
                    <AgentAvatar name={user.displayName} size="md" />
                    <div>
                      <p className="font-medium text-foreground text-sm">{user.displayName}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="capitalize">
                      {user.role}
                    </Badge>
                    {user.role !== 'owner' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn(
                          'shrink-0 text-muted-foreground hover:text-red-500',
                          deletingId === user.id && 'pointer-events-none opacity-50',
                        )}
                        onClick={() => void handleDelete(user.id)}
                      >
                        {deletingId === user.id ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <Trash2 size={16} />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
});
