export type OpenSpecDeltaKind = "ADDED" | "MODIFIED" | "REMOVED" | null;
export interface OpenSpecProposal {
    filePath: string;
    raw: string;
    tags: string[];
    execution?: "worktree" | "terminal";
    intent?: string;
    scope?: string;
    approach?: string;
}
export interface OpenSpecScenario {
    name: string;
    steps: string[];
}
export interface OpenSpecRequirement {
    name: string;
    text: string;
    scenarios: OpenSpecScenario[];
    delta: OpenSpecDeltaKind;
}
export interface OpenSpecSpec {
    domain: string;
    filePath: string;
    purpose?: string;
    requirements: OpenSpecRequirement[];
    delta: OpenSpecDeltaKind;
    parseError?: string;
    raw?: string;
}
export declare const SUPPORTED_HUB_EVENT_VERSION = 1;
export interface HubEventEnvelope {
    version: typeof SUPPORTED_HUB_EVENT_VERSION;
    type: string;
    projectId: string;
    title: string;
    body: string;
    targetUrl: string;
    occurredAt: string;
}
export declare function parseProposalContent(filePath: string, content: string): OpenSpecProposal;
export declare function parseSpecContent(domain: string, filePath: string, content: string): OpenSpecSpec;
export declare function buildHubEventEnvelope(payload: {
    type: string;
    projectId: string;
    title: string;
    body: string;
    targetUrl: string;
    occurredAt?: string;
}): HubEventEnvelope;
export declare function isSupportedHubEventVersion(version: number): boolean;
//# sourceMappingURL=index.d.ts.map