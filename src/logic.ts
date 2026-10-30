import type { DesignRequest, OwnerData, QueueOrderMode, SharedSnapshot } from "./types";

export interface QueueProjection {
  totalQueuedHours: number;
  queuedWeeks: number;
  projectedWeeksById: Map<string, number>;
}

export function calculatePriority(request: Pick<DesignRequest, "impact" | "urgency">): number {
  return request.impact * request.urgency;
}

export function getOrderedQueue(
  requests: DesignRequest[],
  orderMode: QueueOrderMode,
): DesignRequest[] {
  return requests
    .filter((request) => request.status === "queued")
    .sort((a, b) => {
      if (orderMode === "manual" && a.manualOrder !== b.manualOrder) {
        return a.manualOrder - b.manualOrder;
      }

      if (orderMode === "priority") {
        const priorityDifference = calculatePriority(b) - calculatePriority(a);
        if (priorityDifference !== 0) return priorityDifference;
        if (a.estimateHours !== b.estimateHours) return a.estimateHours - b.estimateHours;
      }

      return a.dateAdded.localeCompare(b.dateAdded) || a.id.localeCompare(b.id);
    });
}

export function getQueueProjection(
  queue: DesignRequest[],
  hoursPerWeek: number,
): QueueProjection {
  const totalQueuedHours = queue.reduce((total, request) => total + request.estimateHours, 0);
  const projectedWeeksById = new Map<string, number>();
  let hoursAhead = 0;

  for (const request of queue) {
    projectedWeeksById.set(request.id, Math.floor(hoursAhead / hoursPerWeek) + 1);
    hoursAhead += request.estimateHours;
  }

  return {
    totalQueuedHours,
    queuedWeeks: totalQueuedHours / hoursPerWeek,
    projectedWeeksById,
  };
}

export function createSharedSnapshot(
  data: OwnerData,
  includeScores: boolean,
  publishedAt = new Date().toISOString(),
): SharedSnapshot {
  const queue = getOrderedQueue(data.requests, data.settings.orderMode);
  const queuePositions = new Map(queue.map((request, index) => [request.id, index + 1]));
  const projection = getQueueProjection(queue, data.settings.hoursPerWeek);

  const requests = data.requests.map((request) => {
    const queuePosition = queuePositions.get(request.id) ?? null;
    const sharedRequest = {
      id: request.id,
      title: request.title,
      requester: request.requester,
      estimateHours: request.estimateHours,
      status: request.status,
      queuePosition,
      projectedStartWeek: queuePosition === null
        ? null
        : projection.projectedWeeksById.get(request.id) ?? null,
    };

    return includeScores
      ? { ...sharedRequest, impact: request.impact, urgency: request.urgency }
      : sharedRequest;
  });

  return {
    schemaVersion: 1,
    publishedAt,
    hoursPerWeek: data.settings.hoursPerWeek,
    totalQueuedHours: projection.totalQueuedHours,
    queuedWeeks: projection.queuedWeeks,
    includesScores: includeScores,
    requests,
  };
}

export function getManualOrder(requests: DesignRequest[]): DesignRequest[] {
  return getOrderedQueue(requests, "priority");
}
