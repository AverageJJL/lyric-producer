export type CopilotRevealHandler = (targetId: string) => boolean;

const revealHandlers = new Set<CopilotRevealHandler>();

export function registerCopilotRevealHandler(handler: CopilotRevealHandler): () => void {
  revealHandlers.add(handler);
  return () => {
    revealHandlers.delete(handler);
  };
}

export function revealCopilotTarget(targetId: string): boolean {
  for (const handler of Array.from(revealHandlers)) {
    if (handler(targetId)) {
      return true;
    }
  }
  return false;
}
