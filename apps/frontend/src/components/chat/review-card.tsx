'use client';

import { memo, useCallback, useState } from 'react';
import {
  CheckCircle2,
  CircleDot,
  Clock,
  FileText,
  List,
  Loader2,
  MessageSquare,
  Type,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Review } from '@placet/shared';

// ── Sub-components for each review type ──────────────────────

interface ReviewTypeProps {
  review: Review;
  onRespond: (response: Record<string, unknown>) => void;
  submitting: boolean;
}

/* ---------- approval ---------- */
function ApprovalReview({ review, onRespond, submitting }: ReviewTypeProps) {
  const [comment, setComment] = useState('');
  const payload = review.payload as
    | {
        options?: { id: string; label: string; style?: string }[];
        allowComment?: boolean;
      }
    | undefined;
  const options = payload?.options ?? [
    { id: 'approve', label: 'Approve' },
    { id: 'reject', label: 'Reject' },
  ];

  return (
    <div className="space-y-2">
      {payload?.allowComment && (
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add a comment (optional)…"
          rows={2}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none placeholder:text-muted-foreground resize-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50"
        />
      )}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <Button
            key={opt.id}
            size="sm"
            variant={opt.style === 'danger' ? 'destructive' : 'default'}
            disabled={submitting}
            className="rounded-lg text-xs h-8"
            onClick={() =>
              onRespond({
                selectedOption: opt.id,
                ...(comment.trim() ? { comment: comment.trim() } : {}),
              })
            }
          >
            {submitting && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
            {opt.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/* ---------- selection ---------- */
function SelectionReview({ review, onRespond, submitting }: ReviewTypeProps) {
  const payload = review.payload as
    | {
        mode?: 'single' | 'multi';
        items?: { id: string; label: string; description?: string }[];
      }
    | undefined;
  const items = payload?.items ?? [];
  const isMulti = payload?.mode === 'multi';
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (isMulti) {
        if (next.has(id)) next.delete(id);
        else next.add(id);
      } else {
        next.clear();
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => toggle(item.id)}
            className={cn(
              'w-full flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors',
              selected.has(item.id)
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/40',
            )}
          >
            <span className="mt-0.5 shrink-0">
              {isMulti ? (
                <span
                  className={cn(
                    'inline-block h-3.5 w-3.5 rounded-sm border',
                    selected.has(item.id) ? 'bg-primary border-primary' : 'border-muted-foreground',
                  )}
                />
              ) : (
                <span
                  className={cn(
                    'inline-block h-3.5 w-3.5 rounded-full border-2',
                    selected.has(item.id) ? 'border-primary bg-primary' : 'border-muted-foreground',
                  )}
                />
              )}
            </span>
            <div>
              <span className="font-medium">{item.label}</span>
              {item.description && (
                <span className="block text-muted-foreground">{item.description}</span>
              )}
            </div>
          </button>
        ))}
      </div>
      <Button
        size="sm"
        disabled={submitting || selected.size === 0}
        className="rounded-lg text-xs h-8"
        onClick={() => onRespond({ selectedIds: [...selected] })}
      >
        {submitting && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
        Confirm Selection
      </Button>
    </div>
  );
}

/* ---------- form ---------- */
function FormReview({ review, onRespond, submitting }: ReviewTypeProps) {
  const payload = review.payload as
    | {
        fields?: {
          name: string;
          type: string;
          label: string;
          required?: boolean;
          options?: string[];
        }[];
      }
    | undefined;
  const fields = payload?.fields ?? [];
  const [values, setValues] = useState<Record<string, string>>({});

  const updateField = (name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const requiredMet = fields
    .filter((f) => f.required)
    .every((f) => (values[f.name] ?? '').trim() !== '');

  return (
    <div className="space-y-2">
      {fields.map((field) => (
        <div key={field.name}>
          <label className="block text-[10px] font-medium text-muted-foreground mb-0.5">
            {field.label}
            {field.required && <span className="text-destructive ml-0.5">*</span>}
          </label>
          {field.type === 'select' && field.options ? (
            <select
              value={values[field.name] ?? ''}
              onChange={(e) => updateField(field.name, e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs outline-none focus:border-primary/50"
            >
              <option value="">Select…</option>
              {field.options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          ) : field.type === 'textarea' ? (
            <textarea
              value={values[field.name] ?? ''}
              onChange={(e) => updateField(field.name, e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none placeholder:text-muted-foreground resize-none focus:border-primary/50"
            />
          ) : (
            <input
              type={field.type === 'number' ? 'number' : 'text'}
              value={values[field.name] ?? ''}
              onChange={(e) => updateField(field.name, e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-1.5 text-xs outline-none placeholder:text-muted-foreground focus:border-primary/50"
            />
          )}
        </div>
      ))}
      <Button
        size="sm"
        disabled={submitting || !requiredMet}
        className="rounded-lg text-xs h-8"
        onClick={() => onRespond(values)}
      >
        {submitting && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
        Submit
      </Button>
    </div>
  );
}

/* ---------- text-input ---------- */
function TextInputReview({ review, onRespond, submitting }: ReviewTypeProps) {
  const payload = review.payload as
    | { placeholder?: string; prefill?: string; markdown?: boolean }
    | undefined;
  const [text, setText] = useState(payload?.prefill ?? '');

  return (
    <div className="space-y-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={payload?.placeholder ?? 'Type your response…'}
        rows={3}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none placeholder:text-muted-foreground resize-none focus:border-primary/50 focus:ring-1 focus:ring-primary/50 font-mono"
      />
      <Button
        size="sm"
        disabled={submitting || !text.trim()}
        className="rounded-lg text-xs h-8"
        onClick={() => onRespond({ text: text.trim() })}
      >
        {submitting && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
        Send Response
      </Button>
    </div>
  );
}

/* ---------- freeform ---------- */
function FreeformReview({ review, onRespond, submitting }: ReviewTypeProps) {
  const [json, setJson] = useState('{}');
  const [parseError, setParseError] = useState<string | null>(null);

  const handleSubmit = () => {
    try {
      const parsed = JSON.parse(json) as Record<string, unknown>;
      setParseError(null);
      onRespond(parsed);
    } catch {
      setParseError('Invalid JSON');
    }
  };

  return (
    <div className="space-y-2">
      {review.payload?.schema != null && (
        <p className="text-[10px] text-muted-foreground">
          Schema: {JSON.stringify(review.payload.schema)}
        </p>
      )}
      <textarea
        value={json}
        onChange={(e) => {
          setJson(e.target.value);
          setParseError(null);
        }}
        rows={4}
        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs outline-none placeholder:text-muted-foreground resize-none focus:border-primary/50 font-mono"
      />
      {parseError && <p className="text-[10px] text-destructive">{parseError}</p>}
      <Button
        size="sm"
        disabled={submitting}
        className="rounded-lg text-xs h-8"
        onClick={handleSubmit}
      >
        {submitting && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
        Submit JSON
      </Button>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────

const STATUS_CONFIG = {
  pending: { label: 'Pending', icon: Clock, className: 'bg-warning-muted text-warning-foreground' },
  completed: {
    label: 'Completed',
    icon: CheckCircle2,
    className: 'bg-success-muted text-success-foreground',
  },
  expired: { label: 'Expired', icon: Clock, className: 'bg-muted text-muted-foreground' },
} as const;

const TYPE_ICON = {
  approval: CircleDot,
  selection: List,
  form: FileText,
  'text-input': Type,
  freeform: MessageSquare,
} as const;

// ── CompletedResponse ──────────────────────────────────────────

function CompletedResponse({ review }: { review: Review }) {
  const response = review.response;
  if (!response) return null;

  if (review.type === 'approval') {
    const r = response as { selectedOption?: string; comment?: string };
    return (
      <div className="space-y-1 text-xs">
        <p>
          Selected: <span className="font-medium">{r.selectedOption}</span>
        </p>
        {r.comment && <p className="text-muted-foreground italic">&quot;{r.comment}&quot;</p>}
      </div>
    );
  }

  if (review.type === 'selection') {
    const r = response as { selectedIds?: string[] };
    return (
      <p className="text-xs">
        Selected: <span className="font-medium">{r.selectedIds?.join(', ')}</span>
      </p>
    );
  }

  if (review.type === 'text-input') {
    const r = response as { text?: string };
    return (
      <pre className="text-xs bg-muted/50 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap font-mono">
        {r.text}
      </pre>
    );
  }

  // form / freeform — render as formatted JSON
  return (
    <pre className="text-xs bg-muted/50 rounded-lg p-2 overflow-x-auto max-h-40 font-mono">
      {JSON.stringify(response, null, 2)}
    </pre>
  );
}

// ── Main ReviewCard ──────────────────────────────────────────

interface ReviewCardProps {
  review: Review;
  messageId: string;
  onRespond: (messageId: string, response: Record<string, unknown>) => Promise<void>;
}

export const ReviewCard = memo(function ReviewCard({
  review,
  messageId,
  onRespond,
}: ReviewCardProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleRespond = useCallback(
    async (response: Record<string, unknown>) => {
      if (review.status !== 'pending') return;
      try {
        setSubmitting(true);
        setSubmitError(null);
        await onRespond(messageId, response);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : 'Failed to submit response');
      } finally {
        setSubmitting(false);
      }
    },
    [messageId, onRespond, review.status],
  );

  const isPending = review.status === 'pending';
  const statusCfg = STATUS_CONFIG[review.status] ?? STATUS_CONFIG.pending;
  const StatusIcon = statusCfg.icon;
  const TypeIcon = TYPE_ICON[review.type as keyof typeof TYPE_ICON] ?? CircleDot;

  return (
    <div className="mt-2 rounded-xl border border-border bg-background/50 p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
          <TypeIcon size={14} className="text-muted-foreground" />
          <span className="capitalize">{review.type.replace('-', ' ')}</span>
        </div>
        <Badge
          variant="secondary"
          className={cn('text-[10px] h-5 gap-1 border-0', statusCfg.className)}
        >
          <StatusIcon size={10} />
          {statusCfg.label}
        </Badge>
      </div>

      {/* Pending → show input UI */}
      {isPending && review.type === 'approval' && (
        <ApprovalReview review={review} onRespond={handleRespond} submitting={submitting} />
      )}
      {isPending && review.type === 'selection' && (
        <SelectionReview review={review} onRespond={handleRespond} submitting={submitting} />
      )}
      {isPending && review.type === 'form' && (
        <FormReview review={review} onRespond={handleRespond} submitting={submitting} />
      )}
      {isPending && review.type === 'text-input' && (
        <TextInputReview review={review} onRespond={handleRespond} submitting={submitting} />
      )}
      {isPending && review.type === 'freeform' && (
        <FreeformReview review={review} onRespond={handleRespond} submitting={submitting} />
      )}

      {/* Completed / Expired → show response */}
      {review.status === 'completed' && <CompletedResponse review={review} />}
      {review.status === 'expired' && (
        <p className="text-xs text-muted-foreground italic">This review has expired.</p>
      )}

      {submitError && <p className="text-[10px] text-destructive">{submitError}</p>}

      {review.expiresAt && isPending && (
        <p className="text-[10px] text-muted-foreground">
          Expires: {new Date(review.expiresAt).toLocaleString()}
        </p>
      )}
    </div>
  );
});
