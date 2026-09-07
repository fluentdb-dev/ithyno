const DEFAULT_PORT = 4322;
function defaultPortValue() {
    return DEFAULT_PORT;
}
export function parseHubConfig(env = process.env) {
    const port = Number(env.ITHYNO_HUB_PORT ?? defaultPortValue());
    return {
        host: env.ITHYNO_HUB_HOST ?? "127.0.0.1",
        port: Number.isFinite(port) && port > 0 ? port : DEFAULT_PORT,
        gitlabOrigin: env.ITHYNO_GITLAB_ORIGIN ?? "https://gitlab.example.com",
        projectAllowlist: splitCsv(env.ITHYNO_GITLAB_PROJECT_ALLOWLIST ?? "group/project"),
        botIdentity: env.ITHYNO_HUB_BOT_IDENTITY ?? "ithyno-hub",
        webhookVerificationMode: parseVerificationMode(env.ITHYNO_HUB_WEBHOOK_VERIFICATION_MODE),
        statePath: env.ITHYNO_HUB_STATE_PATH ?? "/tmp/ithyno-hub",
        workstationSubscriptionCredential: env.ITHYNO_HUB_SUBSCRIPTION_CREDENTIAL ?? "change-me",
    };
}
export function validateHubConfig(config) {
    const errors = [];
    if (!config.gitlabOrigin.startsWith("http"))
        errors.push("gitlab origin must be an absolute http(s) URL");
    if (config.projectAllowlist.length === 0)
        errors.push("project allowlist must include at least one project");
    if (!config.botIdentity || config.botIdentity === "ithyno-hub")
        errors.push("bot identity must be explicitly configured");
    if (!config.workstationSubscriptionCredential || config.workstationSubscriptionCredential === "change-me") {
        errors.push("workstation subscription credential must be set to a non-default value");
    }
    return errors;
}
export function redactHubConfig(config) {
    return {
        host: config.host,
        port: config.port,
        gitlabOrigin: config.gitlabOrigin,
        projectAllowlist: config.projectAllowlist,
        botIdentity: config.botIdentity,
        webhookVerificationMode: config.webhookVerificationMode,
        statePath: config.statePath,
        workstationSubscriptionCredential: "[REDACTED]",
    };
}
function parseVerificationMode(value) {
    switch (value?.toLowerCase()) {
        case "legacy":
            return "legacy";
        case "none":
            return "none";
        default:
            return "signed";
    }
}
function splitCsv(value) {
    return value
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
}
