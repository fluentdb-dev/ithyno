// SPDX-License-Identifier: GPL-3.0-or-later
import process from "node:process";
import { parseHubConfig, redactHubConfig, validateHubConfig } from "./config.js";
import { startHubRuntime } from "./app.js";
async function main() {
    const config = parseHubConfig();
    const issues = validateHubConfig(config);
    if (issues.length > 0) {
        console.error(`[hub] invalid config: ${issues.join("; ")}`);
        process.exitCode = 1;
        return;
    }
    console.log(`[hub] starting with ${JSON.stringify(redactHubConfig(config))}`);
    const runtime = await startHubRuntime(config);
    const shutdown = async () => {
        await runtime.close();
        process.exit(0);
    };
    process.on("SIGINT", () => { void shutdown(); });
    process.on("SIGTERM", () => { void shutdown(); });
}
void main();
