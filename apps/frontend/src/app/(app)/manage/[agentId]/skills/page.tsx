'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { BookOpen, Loader2, RefreshCw, Trash2, Upload, AlertCircle } from 'lucide-react';
import { ManagePane } from '@/components/manage/manage-pane';
import { ManageCard, ManageEmptyState } from '@/components/manage/manage-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { manageApi } from '@/components/manage/manage-api';

type SkillSource = 'workspace';

interface SkillEntry {
  name: string;
  source: SkillSource;
  description?: string;
  path: string;
  size?: number;
  mtime?: number;
}

interface ListResponse {
  items: SkillEntry[];
}

const MAX_ZIP_BYTES = 25 * 1024 * 1024; // 25 MiB — matches backend cap

/**
 * Read a File as base64 using `FileReader.readAsDataURL`. The browser does the
 * base64 encoding off the main thread, so we avoid blocking the UI on large
 * uploads the way a synchronous `btoa(String.fromCharCode(...bytes))` loop does.
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Failed to read file'));
        return;
      }
      // result has the form `data:<mime>;base64,<payload>`
      const idx = result.indexOf(',');
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export default function AgentSkillsPage() {
  const params = useParams<{ agentId: string }>();
  const agentId = params.agentId;

  const [items, setItems] = useState<SkillEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadName, setUploadName] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadOverwrite, setUploadOverwrite] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await manageApi<ListResponse>(agentId, 'skills');
      setItems(data.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load skills');
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  const sorted = useMemo(() => [...items].sort((a, b) => a.name.localeCompare(b.name)), [items]);

  const resetUpload = () => {
    setUploadName('');
    setUploadFile(null);
    setUploadOverwrite(false);
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const submitUpload = async () => {
    setUploadError(null);
    const name = uploadName.trim();
    if (!name) {
      setUploadError('Name is required.');
      return;
    }
    if (!uploadFile) {
      setUploadError('Please select a .zip file.');
      return;
    }
    if (uploadFile.size > MAX_ZIP_BYTES) {
      setUploadError('Zip file exceeds 25 MiB limit.');
      return;
    }
    setUploading(true);
    try {
      const zip = await fileToBase64(uploadFile);
      await manageApi(agentId, 'skills', {
        method: 'POST',
        body: JSON.stringify({ name, zip, overwrite: uploadOverwrite }),
      });
      setUploadOpen(false);
      resetUpload();
      await load();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await manageApi(agentId, `skills/${encodeURIComponent(pendingDelete)}`, {
        method: 'DELETE',
      });
      setPendingDelete(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <ManagePane
      title="Skills"
      backHref="/manage"
      subtitle="Workspace skills under workspace/skills/ — add, remove, or replace via the upload dialog."
      actions={
        <div className="flex items-center gap-1">
          <Button
            variant="default"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => {
              resetUpload();
              setUploadOpen(true);
            }}
          >
            <Upload size={14} /> Upload
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={() => void load()}
            disabled={loading}
            title="Refresh"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          </Button>
        </div>
      }
    >
      {error && <p className="text-sm text-destructive">{error}</p>}

      {!loading && sorted.length === 0 && (
        <ManageCard className="border-dashed">
          <ManageEmptyState
            icon={BookOpen}
            title="No skills yet"
            description="Upload a zipped skill or add a directory under workspace/skills/."
          />
        </ManageCard>
      )}

      {sorted.map((s) => (
        <ManageCard
          key={s.name}
          title={
            <span className="flex items-center gap-2 text-base font-semibold">
              <BookOpen size={16} className="text-muted-foreground" />
              <span className="truncate">{s.name}</span>
            </span>
          }
          actions={
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg text-muted-foreground hover:text-destructive"
              onClick={() => setPendingDelete(s.name)}
              title="Delete skill"
            >
              <Trash2 size={14} />
            </Button>
          }
        >
          {s.description ? (
            <p className="text-sm text-muted-foreground">{s.description}</p>
          ) : (
            <p className="text-sm italic text-muted-foreground/70">No description.</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="font-mono">{s.path}</span>
          </div>
        </ManageCard>
      ))}

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload skill</DialogTitle>
            <DialogDescription>
              Provide a name and a <code>.zip</code> archive. The zip must contain a{' '}
              <code>SKILL.md</code> file (either at the root or inside a single top-level folder).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-muted-foreground">Name</label>
              <Input
                value={uploadName}
                onChange={(e) => setUploadName(e.target.value)}
                placeholder="my-skill"
                className="h-9 text-sm"
              />
              <p className="text-sm text-muted-foreground">
                Allowed: letters, digits, <code>_</code>, <code>-</code>, <code>.</code> (max 64
                chars).
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-muted-foreground">Zip file</label>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".zip,application/zip"
                onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                className="h-9 text-sm"
              />
              {uploadFile && (
                <p className="text-sm text-muted-foreground">
                  {uploadFile.name} · {(uploadFile.size / 1024).toFixed(1)} KiB
                </p>
              )}
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={uploadOverwrite}
                onChange={(e) => setUploadOverwrite(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-border accent-foreground"
              />
              Overwrite existing skill with the same name
            </label>

            {uploadError && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
                <AlertCircle size={14} className="text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive">{uploadError}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setUploadOpen(false)}
              disabled={uploading}
            >
              Cancel
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => void submitUpload()}
              disabled={uploading}
              className="gap-1.5"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete skill?</DialogTitle>
            <DialogDescription>
              This will remove <code>{pendingDelete}</code> from the workspace skills directory.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void confirmDelete()}
              disabled={deleting}
              className="gap-1.5"
            >
              {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ManagePane>
  );
}
