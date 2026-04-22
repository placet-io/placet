'use client';

import { Inbox } from 'lucide-react';

export default function InboxPage() {
  return (
    <div className="hidden lg:flex flex-1 items-center justify-center">
      <div className="text-center text-muted-foreground">
        <Inbox className="mx-auto mb-3 h-12 w-12 opacity-30" />
        <p className="text-sm">Select a review to respond</p>
      </div>
    </div>
  );
}
