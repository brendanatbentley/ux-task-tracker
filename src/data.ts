import type {
  DesignRequest,
  OwnerData,
  QueueOrderMode,
  RequestStatus,
  SharedRequest,
  SharedSnapshot,
} from "./types";

export const STORAGE_KEY = "design-backlog-tracker-v1";
export const DEFAULT_HOURS_PER_WEEK = 20;

export const DEFAULT_OWNER_DATA: OwnerData = {
  requests: [],
  settings: {
    hoursPerWeek: DEFAULT_HOURS_PER_WEEK,
    orderMode: "priority",
  },
};

const statuses: RequestStatus[] = ["queued", "in_progress", "done", "parked"];
const orderModes: QueueOrderMode[] = ["priority", "manual"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }
  return value;
}

function positiveNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a number greater than zero.`);
  }
  return value;
}

function capacity(value: unknown, label: string): number {
  const parsed = positiveNumber(value, label);
  if (parsed > 168) {
    throw new Error(`${label} cannot exceed 168 hours per week.`);
  }
  return parsed;
}

function score(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error(`${label} must be a whole number from 1 to 5.`);
  }
  return value;
}

function validateRequest(value: unknown, index: number): DesignRequest {
  if (!isRecord(value)) {
    throw new Error(`Request ${index + 1} is invalid.`);
  }

  const status = value.status;
  if (typeof status !== "string" || !statuses.includes(status as RequestStatus)) {
    throw new Error(`Request ${index + 1} has an invalid status.`);
  }

  const dateAdded = requiredString(value.dateAdded, `Request ${index + 1} date added`);
  if (Number.isNaN(Date.parse(dateAdded))) {
    throw new Error(`Request ${index + 1} has an invalid date added.`);
  }

  const manualOrder = value.manualOrder;
  if (typeof manualOrder !== "number" || !Number.isFinite(manualOrder)) {
    throw new Error(`Request ${index + 1} has an invalid manual order.`);
  }

  return {
    id: nonEmptyString(value.id, `Request ${index + 1} ID`),
    title: nonEmptyString(value.title, `Request ${index + 1} title`),
    requester: requiredString(value.requester, `Request ${index + 1} requester`),
    team: requiredString(value.team, `Request ${index + 1} team`),
    description: requiredString(value.description, `Request ${index + 1} description`),
    estimateHours: positiveNumber(value.estimateHours, `Request ${index + 1} estimate`),
    impact: score(value.impact, `Request ${index + 1} impact`),
    urgency: score(value.urgency, `Request ${index + 1} urgency`),
    status: status as RequestStatus,
    dateAdded,
    manualOrder,
  };
}

function nonEmptyString(value: unknown, label: string): string {
  const parsed = requiredString(value, label);
  if (!parsed.trim()) {
    throw new Error(`${label} cannot be empty.`);
  }
  return parsed;
}

export function parseOwnerData(value: unknown): OwnerData {
  if (!isRecord(value) || !Array.isArray(value.requests) || !isRecord(value.settings)) {
    throw new Error("The file is not a valid backlog export.");
  }

  const orderMode = value.settings.orderMode;
  if (typeof orderMode !== "string" || !orderModes.includes(orderMode as QueueOrderMode)) {
    throw new Error("Queue order mode must be priority or manual.");
  }

  const requests = value.requests.map(validateRequest);
  if (new Set(requests.map((request) => request.id)).size !== requests.length) {
    throw new Error("Every request must have a unique ID.");
  }

  return {
    requests,
    settings: {
      hoursPerWeek: capacity(value.settings.hoursPerWeek, "Weekly capacity"),
      orderMode: orderMode as QueueOrderMode,
    },
  };
}

export function parseSharedSnapshot(value: unknown): SharedSnapshot {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.requests) ||
    typeof value.includesScores !== "boolean"
  ) {
    throw new Error("The published backlog snapshot is missing or invalid.");
  }

  const requests: SharedRequest[] = value.requests.map((request, index) => {
    if (!isRecord(request)) {
      throw new Error(`Published request ${index + 1} is invalid.`);
    }

    const status = request.status;
    if (typeof status !== "string" || !statuses.includes(status as RequestStatus)) {
      throw new Error(`Published request ${index + 1} has an invalid status.`);
    }

    const queuePosition = request.queuePosition;
    const projectedStartWeek = request.projectedStartWeek;
    if (
      !(queuePosition === null || (typeof queuePosition === "number" && Number.isInteger(queuePosition) && queuePosition > 0)) ||
      !(projectedStartWeek === null ||
        (typeof projectedStartWeek === "number" && Number.isInteger(projectedStartWeek) && projectedStartWeek > 0))
    ) {
      throw new Error(`Published request ${index + 1} has invalid queue projections.`);
    }

    const parsed: SharedRequest = {
      id: nonEmptyString(request.id, `Published request ${index + 1} ID`),
      title: nonEmptyString(request.title, `Published request ${index + 1} title`),
      requester: requiredString(request.requester, `Published request ${index + 1} requester`),
      estimateHours: positiveNumber(request.estimateHours, `Published request ${index + 1} estimate`),
      status: status as RequestStatus,
      queuePosition,
      projectedStartWeek,
    };

    if (!value.includesScores && ("impact" in request || "urgency" in request)) {
      throw new Error("The snapshot includes scores while marking them hidden.");
    }
    if (value.includesScores && (!("impact" in request) || !("urgency" in request))) {
      throw new Error(`Published request ${index + 1} is missing scores.`);
    }
    if ("impact" in request || "urgency" in request) {
      parsed.impact = score(request.impact, `Published request ${index + 1} impact`);
      parsed.urgency = score(request.urgency, `Published request ${index + 1} urgency`);
    }
    return parsed;
  });

  const hoursPerWeek = capacity(value.hoursPerWeek, "Published weekly capacity");
  if (new Set(requests.map((request) => request.id)).size !== requests.length) {
    throw new Error("Every published request must have a unique ID.");
  }
  if (typeof value.totalQueuedHours !== "number" || !Number.isFinite(value.totalQueuedHours) || value.totalQueuedHours < 0) {
    throw new Error("Published queued hours are invalid.");
  }
  if (typeof value.queuedWeeks !== "number" || !Number.isFinite(value.queuedWeeks) || value.queuedWeeks < 0) {
    throw new Error("Published queue length is invalid.");
  }
  const publishedAt = requiredString(value.publishedAt, "Published date");
  if (Number.isNaN(Date.parse(publishedAt))) {
    throw new Error("Published date is invalid.");
  }

  return {
    schemaVersion: 1,
    publishedAt,
    hoursPerWeek,
    totalQueuedHours: value.totalQueuedHours,
    queuedWeeks: value.queuedWeeks,
    includesScores: value.includesScores,
    requests,
  };
}
