import { describe, expect, it } from "vitest";
import { createSharedSnapshot, getOrderedQueue, getQueueProjection } from "./logic";
import type { DesignRequest } from "./types";

function request(
  id: string,
  values: Partial<DesignRequest> = {},
): DesignRequest {
  return {
    id,
    title: id,
    requester: "",
    team: "Design",
    description: "",
    estimateHours: 4,
    impact: 3,
    urgency: 3,
    status: "queued",
    dateAdded: "2026-10-01T00:00:00.000Z",
    manualOrder: 0,
    ...values,
  };
}

describe("queue ordering", () => {
  it("sorts by priority, then smaller estimate, then date", () => {
    const requests = [
      request("later", { impact: 4, urgency: 3, estimateHours: 3, dateAdded: "2026-10-03T00:00:00Z" }),
      request("small", { impact: 4, urgency: 3, estimateHours: 2, dateAdded: "2026-10-02T00:00:00Z" }),
      request("older", { impact: 4, urgency: 3, estimateHours: 2, dateAdded: "2026-10-01T00:00:00Z" }),
      request("lower", { impact: 3, urgency: 3, estimateHours: 1 }),
    ];

    expect(getOrderedQueue(requests, "priority").map((item) => item.id))
      .toEqual(["older", "small", "later", "lower"]);
  });

  it("uses the saved manual order instead of priority", () => {
    const requests = [
      request("high", { impact: 5, urgency: 5, manualOrder: 1 }),
      request("low", { impact: 1, urgency: 1, manualOrder: 0 }),
      request("done", { status: "done", manualOrder: -1 }),
    ];

    expect(getOrderedQueue(requests, "manual").map((item) => item.id)).toEqual(["low", "high"]);
  });
});

describe("capacity projections", () => {
  it("places queued requests based on the hours ahead of them", () => {
    const queue = [
      request("first", { estimateHours: 7 }),
      request("second", { estimateHours: 3 }),
      request("third", { estimateHours: 2 }),
    ];

    const projection = getQueueProjection(queue, 8);

    expect(projection.totalQueuedHours).toBe(12);
    expect(projection.queuedWeeks).toBe(1.5);
    expect([...projection.projectedWeeksById.entries()]).toEqual([
      ["first", 1],
      ["second", 1],
      ["third", 2],
    ]);
  });

  it("omits non-queued work from totals and start projections", () => {
    const queue = [
      request("queued", { estimateHours: 5 }),
      request("active", { estimateHours: 8, status: "in_progress" }),
      request("parked", { estimateHours: 10, status: "parked" }),
    ];

    const projection = getQueueProjection(getOrderedQueue(queue, "priority"), 10);

    expect(projection.totalQueuedHours).toBe(5);
    expect(projection.projectedWeeksById.has("active")).toBe(false);
    expect(projection.projectedWeeksById.has("parked")).toBe(false);
  });
});

describe("shared snapshot", () => {
  const ownerData = {
    requests: [
      request("queued"),
      request("active", { status: "in_progress", team: "Platform", description: "Internal notes" }),
    ],
    settings: { hoursPerWeek: 20, orderMode: "priority" as const },
  };

  it("omits scores and owner-only details by default", () => {
    const snapshot = createSharedSnapshot(ownerData, false, "2026-10-30T00:00:00.000Z");
    const queued = snapshot.requests.find((item) => item.id === "queued");

    expect(snapshot.includesScores).toBe(false);
    expect(queued).not.toHaveProperty("impact");
    expect(queued).not.toHaveProperty("urgency");
    expect(queued).not.toHaveProperty("team");
    expect(queued).not.toHaveProperty("description");
    expect(queued?.queuePosition).toBe(1);
    expect(queued?.projectedStartWeek).toBe(1);
  });

  it("includes scores only when the owner opts in", () => {
    const snapshot = createSharedSnapshot(ownerData, true);

    expect(snapshot.includesScores).toBe(true);
    expect(snapshot.requests[0]).toMatchObject({ impact: 3, urgency: 3 });
  });
});
