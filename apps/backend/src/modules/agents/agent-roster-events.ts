import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'node:events';

/**
 * Tiny in-process pub/sub for agent roster mutations (create / remove /
 * setManagement). Lets downstream modules (e.g. agent-management daily-usage
 * cache) invalidate without introducing a circular dependency.
 */
@Injectable()
export class AgentRosterEvents {
  private readonly emitter = new EventEmitter();

  emitRosterChanged(ownerId: string): void {
    this.emitter.emit('rosterChanged', ownerId);
  }

  onRosterChanged(listener: (ownerId: string) => void): () => void {
    this.emitter.on('rosterChanged', listener);
    return () => this.emitter.off('rosterChanged', listener);
  }
}
