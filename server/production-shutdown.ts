import type { FastifyInstance } from "fastify";

export function registerProductionShutdown(
  app: FastifyInstance,
  onClose: () => void | Promise<void>,
): void {
  app.addHook("onClose", async () => {
    await onClose();
  });
}
