import type { DomainEvent, DomainEventType } from '@codelens/shared';

export type EventHandler<T = unknown> = (event: DomainEvent<T>) => Promise<void> | void;

export interface EventBus {
  publish<T>(event: DomainEvent<T>): Promise<void>;
  subscribe<T>(eventType: DomainEventType, handler: EventHandler<T>): () => void;
}

/**
 * Local event bus used by the API and demo. Its interface deliberately mirrors a
 * durable broker so it can later be replaced by Redis Streams without coupling
 * application services to transport details.
 */
export class InMemoryEventBus implements EventBus {
  private readonly handlers = new Map<DomainEventType, Set<EventHandler>>();

  subscribe<T>(eventType: DomainEventType, handler: EventHandler<T>): () => void {
    const listeners = this.handlers.get(eventType) ?? new Set<EventHandler>();
    listeners.add(handler as EventHandler);
    this.handlers.set(eventType, listeners);
    return () => listeners.delete(handler as EventHandler);
  }

  async publish<T>(event: DomainEvent<T>): Promise<void> {
    const listeners = this.handlers.get(event.eventType) ?? new Set<EventHandler>();
    await Promise.all([...listeners].map((handler) => handler(event)));
  }
}

export function createEvent<T>(
  eventType: DomainEventType,
  source: string,
  correlationId: string,
  payload: T,
  causationId?: string,
): DomainEvent<T> {
  return {
    eventId: crypto.randomUUID(),
    eventType,
    timestamp: new Date().toISOString(),
    source,
    correlationId,
    causationId,
    payload,
    schemaVersion: 1,
  };
}
