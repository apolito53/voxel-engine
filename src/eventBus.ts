type EventHandler<Payload> = (event: Payload) => void;

// Tiny in-memory pub/sub for engine systems. This deliberately stays away from
// DOM CustomEvent so gameplay events remain typed, local, and easy to refactor.
export class EventBus<Events extends object> {
  private readonly handlers = new Map<keyof Events, Set<EventHandler<Events[keyof Events]>>>();

  on<K extends keyof Events>(type: K, handler: EventHandler<Events[K]>): () => void {
    let handlersForType = this.handlers.get(type);
    if (!handlersForType) {
      handlersForType = new Set();
      this.handlers.set(type, handlersForType);
    }

    const storedHandler = handler as EventHandler<Events[keyof Events]>;
    handlersForType.add(storedHandler);

    return () => {
      handlersForType.delete(storedHandler);
      if (handlersForType.size === 0) {
        this.handlers.delete(type);
      }
    };
  }

  emit<K extends keyof Events>(type: K, event: Events[K]): void {
    const handlersForType = this.handlers.get(type);
    if (!handlersForType) return;

    // Snapshot first so a handler can unsubscribe itself without skipping the
    // next subscriber in the same event burst.
    for (const handler of Array.from(handlersForType)) {
      handler(event);
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}
