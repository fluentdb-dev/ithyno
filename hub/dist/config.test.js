// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { parseHubConfig, redactHubConfig, validateHubConfig } from "./config.js";
describe("hub config", () => {
    it("rejects placeholder defaults", () => {
        const config = parseHubConfig({
            ITHYNO_HUB_PORT: "4322",
            ITHYNO_GITLAB_ORIGIN: "https://gitlab.example.com",
            ITHYNO_GITLAB_PROJECT_ALLOWLIST: "group/project",
            ITHYNO_HUB_BOT_IDENTITY: "ithyno-hub",
            ITHYNO_HUB_SUBSCRIPTION_CREDENTIAL: "change-me",
        });
        const errors = validateHubConfig(config);
        expect(errors).toContain("bot identity must be explicitly configured");
        expect(errors).toContain("workstation subscription credential must be set to a non-default value");
    });
    it("redacts configuration secrets", () => {
        const redacted = redactHubConfig(parseHubConfig({
            ITHYNO_HUB_SUBSCRIPTION_CREDENTIAL: "super-secret",
        }));
        expect(redacted.workstationSubscriptionCredential).toBe("[REDACTED]");
    });
});
