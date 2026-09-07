export interface HubConfig {
    host: string;
    port: number;
    gitlabOrigin: string;
    projectAllowlist: string[];
    botIdentity: string;
    webhookVerificationMode: "signed" | "legacy" | "none";
    statePath: string;
    workstationSubscriptionCredential: string;
}
export declare function parseHubConfig(env?: NodeJS.ProcessEnv): HubConfig;
export declare function validateHubConfig(config: HubConfig): string[];
export declare function redactHubConfig(config: HubConfig): Record<string, unknown>;
//# sourceMappingURL=config.d.ts.map