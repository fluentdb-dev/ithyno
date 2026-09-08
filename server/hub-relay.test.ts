// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from "vitest";
import { isAllowedHubNotificationTarget } from "./hub-relay.js";

describe("hub relay safety", () => {
  it("accepts notifications for configured GitLab origins and projects", () => {
    const allowed = isAllowedHubNotificationTarget(
      { projectId: "group/project", targetUrl: "https://gitlab.example.com/group/project/-/issues/1" },
      { gitlabOrigin: "https://gitlab.example.com", projectIds: ["group/project"] },
    );
    expect(allowed).toBe(true);
  });

  it("rejects notifications outside the configured origin or project", () => {
    expect(
      isAllowedHubNotificationTarget(
        { projectId: "group/project", targetUrl: "https://evil.example.com/group/project/-/issues/1" },
        { gitlabOrigin: "https://gitlab.example.com", projectIds: ["group/project"] },
      ),
    ).toBe(false);
    expect(
      isAllowedHubNotificationTarget(
        { projectId: "other/project", targetUrl: "https://gitlab.example.com/other/project/-/issues/1" },
        { gitlabOrigin: "https://gitlab.example.com", projectIds: ["group/project"] },
      ),
    ).toBe(false);
  });
});
