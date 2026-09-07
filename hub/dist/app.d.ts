import Fastify from "fastify";
import type { HubConfig } from "./config.js";
export interface HubRuntime {
    app: ReturnType<typeof Fastify>;
    close: () => Promise<void>;
}
export declare function startHubRuntime(config: HubConfig): Promise<HubRuntime>;
//# sourceMappingURL=app.d.ts.map