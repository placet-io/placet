'use client';

import { memo, useState } from 'react';
import Link from 'next/link';
import { Inbox, ListFilter, Loader2, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AgentAvatar } from '@/components/shared/agent-avatar';
import { MobileNavDrawer } from '@/components/layout/mobile-nav-drawer';
import { useInboxContext } from '@/lib/contexts/inbox-context';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/format-date';
import type { Message, Review } from '@placet/shared';

const REVIEW_TYPE_LABELS: Record<string, string> = {
  approval: 'Approval',
  selection: 'Selection',
  form: 'Form',
  'text-input': 'Text Input',
  freeform: 'Freeform',
};

interface AgentInfo {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

interface InboxListProps {
  reviews: Message[];
  agents: AgentInfo[];
  loading: boolean;
  activeReviewId?: string;
  className?: string;
}

export const InboxList = memo(function InboxList({
  reviews,
  agents,
  loading,
  activeReviewId,
  className,
}: InboxListProps) {
  const [search, setSearch] = useState('');
  const { statusFilter, sort, setStatusFilter, setSort, isUnread } = useInboxContext();

  const agentMap = new Map(agents.map((a) => [a.id, a]));

  // Group iterations: keep only the latest message per iterationGroupId
  const deduped = (() => {
    const groupLatest = new Map<string, Message>();
    const standalone: Message[] = [];
    for (const r of reviews) {
      if (r.iterationGroupId) {
        const existing = groupLatest.get(r.iterationGroupId);
        if (!existing || (r.iteration ?? 0) > (existing.iteration ?? 0)) {
          groupLatest.set(r.iterationGroupId, r);
        }
      } else {
        standalone.push(r);
      }
    }
    return [...standalone, ...groupLatest.values()].sort((a, b) =>
      sort === 'newest'
        ? new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        : new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  })();

  const filtered = deduped.filter((r) => {
    if (!search) return true;
    const agent = agentMap.get(r.channelId);
    const agentName = agent?.name ?? '';
    const text = r.text ?? '';
    const q = search.toLowerCase();
    return agentName.toLowerCase().includes(q) || text.toLowerCase().includes(q);
  });

  const STATUS_LABELS = {
    pending: 'Pending',
    completed: 'Completed',
    all: 'All',
  } as const;
  const SORT_LABELS = { newest: 'Newest first', oldest: 'Oldest first' } as const;

  return (
    <div
      className={cn(
        'flex h-full w-full lg:w-[320px] xl:w-[380px] shrink-0 flex-col bg-card rounded-t-3xl lg:rounded-b-3xl overflow-hidden shadow-sm border border-border/50 border-b-0 lg:border-b',
        className,
      )}
    >
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <MobileNavDrawer />
            <h1 className="text-xl font-semibold text-foreground">Inbox</h1>
          </div>
          {reviews.length > 0 &&
            (() => {
              const unreadCount = reviews.filter((r) => isUnread(r.id)).length;
              return (
                <Badge
                  variant="secondary"
                  className={cn(
                    'h-6 min-w-6 px-2 rounded-full text-xs',
                    unreadCount > 0 && 'bg-primary text-primary-foreground',
                  )}
                >
                  {unreadCount > 0 ? unreadCount : reviews.length}
                </Badge>
              );
            })()}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search reviews…"
              className="pl-9 h-9 rounded-lg"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 rounded-lg">
                  <ListFilter size={16} />
                </Button>
              }
            />
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuGroup>
                <DropdownMenuLabel>Status</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={statusFilter}
                  onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
                >
                  {(Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[]).map((key) => (
                    <DropdownMenuRadioItem key={key} value={key}>
                      {STATUS_LABELS[key]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>Sort</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={sort}
                  onValueChange={(v) => setSort(v as typeof sort)}
                >
                  {(Object.keys(SORT_LABELS) as (keyof typeof SORT_LABELS)[]).map((key) => (
                    <DropdownMenuRadioItem key={key} value={key}>
                      {SORT_LABELS[key]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-0.5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Inbox className="h-10 w-10 mb-2 opacity-30" />
              <p className="text-sm">
                {search
                  ? 'No matching reviews'
                  : statusFilter === 'pending'
                    ? 'No pending reviews'
                    : statusFilter === 'completed'
                      ? 'No completed reviews'
                      : 'No reviews'}
              </p>
            </div>
          ) : (
            filtered.map((review) => {
              const agent = agentMap.get(review.channelId);
              const reviewData = review.review as Review;
              return (
                <InboxListItem
                  key={review.id}
                  messageId={review.id}
                  agentName={agent?.name ?? 'Unknown Agent'}
                  agentAvatarUrl={agent?.avatarUrl}
                  text={review.text}
                  reviewType={reviewData?.type}
                  reviewStatus={reviewData?.status}
                  iteration={review.iteration}
                  createdAt={review.createdAt}
                  isActive={activeReviewId === review.id}
                  isUnread={isUnread(review.id)}
                />
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
});

// ── Individual inbox item ──────────────────────────────────────

const InboxListItem = memo(function InboxListItem({
  messageId,
  agentName,
  agentAvatarUrl,
  text,
  reviewType,
  reviewStatus,
  iteration,
  createdAt,
  isActive,
  isUnread,
}: {
  messageId: string;
  agentName: string;
  agentAvatarUrl?: string | null;
  text?: string | null;
  reviewType?: string;
  reviewStatus?: string;
  iteration?: number | null;
  createdAt: string;
  isActive: boolean;
  isUnread: boolean;
}) {
  const isDone = reviewStatus === 'completed' || reviewStatus === 'expired';

  return (
    <Link
      href={`/inbox/${messageId}`}
      className={cn(
        'w-full flex items-center gap-3 p-3 rounded-lg text-left transition-all duration-200',
        isActive ? 'bg-muted' : 'hover:bg-muted/50',
        isDone && 'opacity-60',
      )}
    >
      <AgentAvatar name={agentName} avatarUrl={agentAvatarUrl} size="md" className="shrink-0" />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2 mb-0.5">
          <h3
            className={cn(
              'truncate text-sm font-medium',
              isUnread ? 'text-primary' : 'text-foreground',
            )}
          >
            {agentName}
          </h3>
          <span className="shrink-0 text-xs text-muted-foreground whitespace-nowrap">
            {formatRelativeTime(createdAt)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <p
            className={cn(
              'truncate text-xs flex-1',
              isUnread ? 'text-foreground/80' : 'text-muted-foreground',
            )}
          >
            {text ?? 'Review requested'}
          </p>
          {reviewType && (
            <Badge variant="outline" className="shrink-0 text-[10px] h-4 px-1.5 rounded-md">
              {REVIEW_TYPE_LABELS[reviewType] ?? reviewType}
            </Badge>
          )}
          {iteration != null && iteration > 1 && (
            <Badge
              variant="outline"
              className="shrink-0 text-[10px] h-4 px-1.5 rounded-md font-mono"
            >
              Rev {iteration}
            </Badge>
          )}
          {isDone && (
            <Badge
              variant={reviewStatus === 'completed' ? 'default' : 'secondary'}
              className="shrink-0 text-[10px] h-4 px-1.5 rounded-md"
            >
              {reviewStatus === 'completed' ? 'Done' : 'Expired'}
            </Badge>
          )}
        </div>
      </div>
    </Link>
  );
});
