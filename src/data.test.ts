import { describe, expect, it } from "vitest";
import { parseOwnerData, parseSharedSnapshot } from "./data";

const request = {
  id: "request-1",
  title: "Design a flow",
  requester: "",
  team: "",
  description: "",
  estimateHours: 3,
  impact: 4,
  urgency: 2,
  status: "queued",
  dateAdded: "2026-10-30T00:00:00.000Z",
  manualOrder: 0,
};

const ownerData = {
  requests: [request],
  settings: { hoursPerWeek: 20, orderMode: "priority" },
};

describe("owner data imports", () => {
  it("accepts valid exported data", () => {
    expect(parseOwnerData(ownerData)).toEqual(ownerData);
  });

  it("rejects duplicate IDs, empty titles, and invalid capacity", () => {
    expect(() => parseOwnerData({
      ...ownerData,
      requests: [request, { ...request }],
    })).toThrow("unique ID");
    expect(() => parseOwnerData({
      ...ownerData,
      requests: [{ ...request, title: " " }],
    })).toThrow("cannot be empty");
    expect(() => parseOwnerData({
      ...ownerData,
      settings: { ...ownerData.settings, hoursPerWeek: 200 },
    })).toThrow("cannot exceed 168");
  });
});

describe("shared snapshot validation", () => {
  const snapshot = {
    schemaVersion: 1,
    publishedAt: "2026-10-30T00:00:00.000Z",
    hoursPerWeek: 20,
    totalQueuedHours: 3,
    queuedWeeks: 0.15,
    includesScores: false,
    requests: [{
      id: request.id,
      title: request.title,
      requester: request.requester,
      estimateHours: request.estimateHours,
      status: request.status,
      queuePosition: 1,
      projectedStartWeek: 1,
    }],
  };

  it("accepts the score-free published shape", () => {
    expect(parseSharedSnapshot(snapshot)).toMatchObject({
      includesScores: false,
      requests: [{ id: request.id, queuePosition: 1 }],
    });
  });

  it("rejects hidden scores embedded in a public snapshot", () => {
    expect(() => parseSharedSnapshot({
      ...snapshot,
      requests: [{ ...snapshot.requests[0], impact: 4, urgency: 2 }],
    })).toThrow("marking them hidden");
  });

  it("requires both scores when the owner opts in", () => {
    expect(() => parseSharedSnapshot({
      ...snapshot,
      includesScores: true,
    })).toThrow("missing scores");
    expect(parseSharedSnapshot({
      ...snapshot,
      includesScores: true,
      requests: [{ ...snapshot.requests[0], impact: 4, urgency: 2 }],
    }).requests[0]).toMatchObject({ impact: 4, urgency: 2 });
  });
});
