'use client';

import { Bot } from 'lucide-react';
import { useAgentsContext } from '@/lib/contexts/agents-context';

export default function ChatsPage() {
  const { loading } = useAgentsContext();

  return (
    <div className="hidden lg:flex flex-1 items-center justify-center bg-card rounded-3xl shadow-sm border border-border/50">
      <div className="text-center text-muted-foreground">
        <Bot className="mx-auto mb-3 h-12 w-12 opacity-30" />
        <p className="text-sm">
          {loading ? 'Loading agents...' : 'Select an agent to start messaging'}
        </p>
      </div>
    </div>
  );
}
