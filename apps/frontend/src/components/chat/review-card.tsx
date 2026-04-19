'use client';

import { memo, useCallback, useState } from 'react';
import { format } from 'date-fns';
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  CircleDot,
  Clock,
  FileText,
  List,
  Loader2,
  MessageSquare,
  RefreshCw,
  Type,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
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
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add a comment (optional)…"
          rows={2}
          className="text-sm min-h-0"
        />
      )}
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <Button
            key={opt.id}
            size="sm"
            variant={opt.style === 'danger' ? 'destructive' : 'default'}
            disabled={submitting}
            className="rounded-lg text-sm h-8"
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
        submitLabel?: string;
        dismissLabel?: string;
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
              'w-full flex items-start gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
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
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={submitting || selected.size === 0}
          className="rounded-lg text-sm h-8"
          onClick={() => onRespond({ selectedIds: [...selected] })}
        >
          {submitting && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
          {payload?.submitLabel ?? 'Confirm Selection'}
        </Button>
        {payload?.dismissLabel && (
          <Button
            size="sm"
            variant="outline"
            disabled={submitting}
            className="rounded-lg text-sm h-8"
            onClick={() => onRespond({ _dismissed: true })}
          >
            {payload.dismissLabel}
          </Button>
        )}
      </div>
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
          options?: (string | { label: string; value: string })[];
          min?: number;
          max?: number;
          step?: number;
          unit?: string;
          defaultValue?: string | number | boolean;
          description?: string;
        }[];
        submitLabel?: string;
        dismissLabel?: string;
      }
    | undefined;
  const fields = payload?.fields ?? [];
  const [values, setValues] = useState<Record<string, string | number | boolean>>(() => {
    const initial: Record<string, string | number | boolean> = {};
    for (const f of fields) {
      if (f.defaultValue !== undefined) {
        initial[f.name] = f.defaultValue;
      } else if (f.type === 'range') {
        initial[f.name] = f.min ?? 0;
      }
    }
    return initial;
  });

  const updateField = (name: string, value: string | number | boolean) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const requiredMet = fields
    .filter((f) => f.required)
    .every((f) => {
      const v = values[f.name];
      if (v === undefined || v === null) return false;
      if (typeof v === 'string') return v.trim() !== '';
      return true;
    });

  return (
    <div className="space-y-2 max-w-lg">
      {fields.map((field) => (
        <div key={field.name}>
          <label className="block text-xs font-medium text-muted-foreground mb-0.5">
            {field.label}
            {field.required && <span className="text-destructive ml-0.5">*</span>}
          </label>
          {field.type === 'select' && field.options ? (
            <Select
              value={(values[field.name] as string) || undefined}
              onValueChange={(val) => updateField(field.name, (val ?? '') as string)}
            >
              <SelectTrigger className="w-full text-sm">
                <SelectValue placeholder="Select…" />
              </SelectTrigger>
              <SelectContent>
                {field.options.map((opt) => {
                  const optValue = typeof opt === 'string' ? opt : opt.value;
                  const optLabel = typeof opt === 'string' ? opt : opt.label;
                  return (
                    <SelectItem key={optValue} value={optValue}>
                      {optLabel}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          ) : field.type === 'textarea' ? (
            <Textarea
              value={(values[field.name] as string) ?? ''}
              onChange={(e) => updateField(field.name, e.target.value)}
              rows={2}
              className="text-sm"
            />
          ) : field.type === 'checkbox' ? (
            <div className="flex items-center gap-2">
              <Checkbox
                checked={!!values[field.name]}
                onCheckedChange={(checked) => updateField(field.name, checked)}
              />
              {field.description && (
                <span className="text-sm text-muted-foreground">{field.description}</span>
              )}
            </div>
          ) : field.type === 'range' ? (
            <div className="flex items-center gap-3">
              <Slider
                min={field.min ?? 0}
                max={field.max ?? 100}
                step={field.step ?? 1}
                value={[Number(values[field.name] ?? field.min ?? 0)]}
                onValueChange={(val) => updateField(field.name, Array.isArray(val) ? val[0] : val)}
                className="flex-1"
              />
              <span className="text-sm font-medium tabular-nums min-w-[3ch] text-right">
                {values[field.name] ?? field.min ?? 0}
                {field.unit ? ` ${field.unit}` : ''}
              </span>
            </div>
          ) : field.type === 'date' ? (
            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    data-empty={!values[field.name]}
                    className="w-full justify-start text-left text-sm font-normal h-8 data-[empty=true]:text-muted-foreground"
                  />
                }
              >
                <CalendarIcon className="size-3.5" />
                {values[field.name]
                  ? format(new Date((values[field.name] as string) + 'T00:00:00'), 'PPP')
                  : 'Pick a date'}
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0">
                <Calendar
                  mode="single"
                  selected={
                    values[field.name]
                      ? new Date((values[field.name] as string) + 'T00:00:00')
                      : undefined
                  }
                  onSelect={(date) =>
                    updateField(field.name, date ? format(date, 'yyyy-MM-dd') : '')
                  }
                />
              </PopoverContent>
            </Popover>
          ) : field.type === 'time' ? (
            <Input
              type="time"
              value={(values[field.name] as string) ?? ''}
              onChange={(e) => updateField(field.name, e.target.value)}
              className="text-sm h-8 [&::-webkit-calendar-picker-indicator]:hidden"
            />
          ) : field.type === 'datetime' ? (
            (() => {
              const dtVal = (values[field.name] as string) ?? '';
              const [datePart = '', timePart = ''] = dtVal.split('T');
              const dateObj = datePart ? new Date(datePart + 'T00:00:00') : undefined;
              return (
                <div className="flex gap-1.5">
                  <Popover>
                    <PopoverTrigger
                      render={
                        <Button
                          variant="outline"
                          data-empty={!datePart}
                          className="flex-1 justify-start text-left text-sm font-normal h-8 data-[empty=true]:text-muted-foreground"
                        />
                      }
                    >
                      <CalendarIcon className="size-3.5" />
                      {dateObj ? format(dateObj, 'PP') : 'Date'}
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={dateObj}
                        onSelect={(date) =>
                          updateField(
                            field.name,
                            date ? `${format(date, 'yyyy-MM-dd')}T${timePart || '00:00'}` : '',
                          )
                        }
                      />
                    </PopoverContent>
                  </Popover>
                  <Input
                    type="time"
                    value={timePart}
                    onChange={(e) =>
                      updateField(
                        field.name,
                        `${datePart || format(new Date(), 'yyyy-MM-dd')}T${e.target.value}`,
                      )
                    }
                    className="w-auto text-sm h-8 [&::-webkit-calendar-picker-indicator]:hidden"
                  />
                </div>
              );
            })()
          ) : (
            <Input
              type={
                field.type === 'number'
                  ? 'number'
                  : field.type === 'email'
                    ? 'email'
                    : field.type === 'url'
                      ? 'url'
                      : field.type === 'password'
                        ? 'password'
                        : 'text'
              }
              value={(values[field.name] as string) ?? ''}
              onChange={(e) => updateField(field.name, e.target.value)}
              className="text-sm h-8"
            />
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={submitting || !requiredMet}
          className="rounded-lg text-sm h-8"
          onClick={() => onRespond(values as Record<string, unknown>)}
        >
          {submitting && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
          {payload?.submitLabel ?? 'Submit'}
        </Button>
        {payload?.dismissLabel && (
          <Button
            size="sm"
            variant="outline"
            disabled={submitting}
            className="rounded-lg text-sm h-8"
            onClick={() => onRespond({ _dismissed: true })}
          >
            {payload.dismissLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

/* ---------- text-input ---------- */
function TextInputReview({ review, onRespond, submitting }: ReviewTypeProps) {
  const payload = review.payload as
    | {
        placeholder?: string;
        prefill?: string;
        markdown?: boolean;
        submitLabel?: string;
        dismissLabel?: string;
      }
    | undefined;
  const [text, setText] = useState(payload?.prefill ?? '');

  return (
    <div className="space-y-2">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={payload?.placeholder ?? 'Type your response…'}
        rows={3}
        className="text-sm min-h-0 font-mono"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={submitting || !text.trim()}
          className="rounded-lg text-sm h-8"
          onClick={() => onRespond({ text: text.trim() })}
        >
          {submitting && <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />}
          {payload?.submitLabel ?? 'Send Response'}
        </Button>
        {payload?.dismissLabel && (
          <Button
            size="sm"
            variant="outline"
            disabled={submitting}
            className="rounded-lg text-sm h-8"
            onClick={() => onRespond({ _dismissed: true })}
          >
            {payload.dismissLabel}
          </Button>
        )}
      </div>
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
        <p className="text-xs text-muted-foreground">
          Schema: {JSON.stringify(review.payload.schema)}
        </p>
      )}
      <Textarea
        value={json}
        onChange={(e) => {
          setJson(e.target.value);
          setParseError(null);
        }}
        rows={4}
        className="text-sm min-h-0 font-mono"
      />
      {parseError && <p className="text-xs text-destructive">{parseError}</p>}
      <Button
        size="sm"
        disabled={submitting}
        className="rounded-lg text-sm h-8"
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

// ── CompletedFormResponse ──────────────────────────────────────

type FormField = {
  name: string;
  type: string;
  label: string;
  required?: boolean;
  options?: (string | { label: string; value: string })[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
};

function CompletedFormResponse({ review }: { review: Review }) {
  const payload = review.payload as { fields?: FormField[]; submitLabel?: string } | undefined;
  const fields = payload?.fields ?? [];
  const response = review.response as Record<string, unknown> | undefined;
  if (!response) return null;

  return (
    <div className="space-y-2 max-w-lg">
      {fields.map((field) => {
        const val = response[field.name];
        return (
          <div key={field.name}>
            <label className="block text-xs font-medium text-muted-foreground mb-0.5">
              {field.label}
            </label>
            {field.type === 'select' && field.options ? (
              <Select value={String(val ?? '')} disabled>
                <SelectTrigger className="w-full text-sm opacity-70">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {field.options.map((opt) => {
                    const optValue = typeof opt === 'string' ? opt : opt.value;
                    const optLabel = typeof opt === 'string' ? opt : opt.label;
                    return (
                      <SelectItem key={optValue} value={optValue}>
                        {optLabel}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            ) : field.type === 'textarea' ? (
              <Textarea
                value={String(val ?? '')}
                readOnly
                rows={2}
                className="text-sm min-h-0 opacity-70"
              />
            ) : field.type === 'checkbox' ? (
              <Checkbox checked={!!val} disabled />
            ) : field.type === 'range' ? (
              <div className="flex items-center gap-3">
                <Slider
                  min={field.min ?? 0}
                  max={field.max ?? 100}
                  step={field.step ?? 1}
                  value={[Number(val ?? field.min ?? 0)]}
                  disabled
                  className="flex-1 opacity-70"
                />
                <span className="text-sm font-medium tabular-nums min-w-[3ch] text-right">
                  {String(val ?? field.min ?? 0)}
                  {field.unit ? ` ${field.unit}` : ''}
                </span>
              </div>
            ) : field.type === 'date' ? (
              <Button
                variant="outline"
                disabled
                className="w-full justify-start text-left text-sm font-normal h-8 opacity-70"
              >
                <CalendarIcon className="size-3.5" />
                {val ? format(new Date(String(val) + 'T00:00:00'), 'PPP') : '—'}
              </Button>
            ) : field.type === 'time' ? (
              <Input
                type="time"
                value={String(val ?? '')}
                readOnly
                className="text-sm h-8 opacity-70 [&::-webkit-calendar-picker-indicator]:hidden"
              />
            ) : field.type === 'datetime' ? (
              (() => {
                const dtVal = String(val ?? '');
                const [datePart = '', timePart = ''] = dtVal.split('T');
                const dateObj = datePart ? new Date(datePart + 'T00:00:00') : undefined;
                return (
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      disabled
                      className="flex-1 justify-start text-left text-sm font-normal h-8 opacity-70"
                    >
                      <CalendarIcon className="size-3.5" />
                      {dateObj ? format(dateObj, 'PP') : '—'}
                    </Button>
                    <Input
                      type="time"
                      value={timePart}
                      readOnly
                      className="w-auto text-sm h-8 opacity-70 [&::-webkit-calendar-picker-indicator]:hidden"
                    />
                  </div>
                );
              })()
            ) : field.type === 'password' ? (
              <Input type="password" value="••••••••" readOnly className="text-sm h-8 opacity-70" />
            ) : (
              <Input
                type="text"
                value={String(val ?? '')}
                readOnly
                className="text-sm h-8 opacity-70"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── CompletedResponse ──────────────────────────────────────────

function CompletedResponse({ review }: { review: Review }) {
  const response = review.response;
  if (!response) return null;

  if (review.type === 'approval') {
    const r = response as { selectedOption?: string; comment?: string };
    return (
      <div className="space-y-1 text-sm">
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
      <p className="text-sm">
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

  if (review.type === 'form') {
    return <CompletedFormResponse review={review} />;
  }

  // freeform — render as formatted JSON
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
  deliveryStatus?: string | null;
  onRespond: (
    messageId: string,
    response: Record<string, unknown>,
    modifiedFileIds?: Record<string, string>,
    options?: { feedback?: string },
  ) => Promise<void>;
  onRetryDelivery?: (messageId: string) => Promise<void>;
}

export const ReviewCard = memo(function ReviewCard({
  review,
  messageId,
  deliveryStatus,
  onRespond,
  onRetryDelivery,
}: ReviewCardProps) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);

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

  const handleRetry = useCallback(async () => {
    if (!onRetryDelivery) return;
    try {
      setRetrying(true);
      await onRetryDelivery(messageId);
    } catch {
      // delivery event via socket will update status
    } finally {
      setRetrying(false);
    }
  }, [messageId, onRetryDelivery]);

  const isPending = review.status === 'pending';
  const statusCfg = STATUS_CONFIG[review.status] ?? STATUS_CONFIG.pending;
  const StatusIcon = statusCfg.icon;
  const TypeIcon = TYPE_ICON[review.type as keyof typeof TYPE_ICON] ?? CircleDot;

  return (
    <div className="mt-2 rounded-xl border border-border bg-background/50 p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <TypeIcon size={14} className="text-muted-foreground" />
          <span className="capitalize">{review.type.replace('-', ' ')}</span>
        </div>
        <Badge
          variant="secondary"
          className={cn('text-xs h-5 gap-1 border-0', statusCfg.className)}
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
      {review.status === 'completed' && (
        <div className="space-y-1">
          <CompletedResponse review={review} />
          {review.feedback && (
            <p className="text-sm text-muted-foreground italic">
              Feedback: &quot;{review.feedback}&quot;
            </p>
          )}
        </div>
      )}
      {review.status === 'expired' && (
        <p className="text-sm text-muted-foreground italic">This review has expired.</p>
      )}

      {submitError && <p className="text-xs text-destructive">{submitError}</p>}

      {review.status === 'completed' && deliveryStatus === 'webhook_failed' && onRetryDelivery && (
        <div className="flex items-center gap-2 text-xs text-destructive">
          <span>Webhook delivery failed</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs gap-1"
            disabled={retrying}
            onClick={handleRetry}
          >
            {retrying ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
            Retry
          </Button>
        </div>
      )}

      {review.status === 'completed' && deliveryStatus === 'webhook_delivered' && (
        <p className="text-xs text-muted-foreground">✓✓ Delivered to agent</p>
      )}

      {review.status === 'completed' && deliveryStatus === 'agent_received' && (
        <p className="text-xs text-blue-500">✓✓ Acknowledged by agent</p>
      )}

      {review.expiresAt && isPending && (
        <p className="text-xs text-muted-foreground">
          Expires: {new Date(review.expiresAt).toLocaleString()}
        </p>
      )}
    </div>
  );
});
