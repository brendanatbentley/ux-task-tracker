export type RequestStatus = "queued" | "in_progress" | "done" | "parked";
export type QueueOrderMode = "priority" | "manual";

export interface DesignRequest {
  id: string;
  title: string;
  requester: string;
  team: string;
  description: string;
  estimateHours: number;
  impact: number;
  urgency: number;
  status: RequestStatus;
  dateAdded: string;
  manualOrder: number;
}

export interface TrackerSettings {
  hoursPerWeek: number;
  orderMode: QueueOrderMode;
}

export interface OwnerData {
  requests: DesignRequest[];
  settings: TrackerSettings;
}

export interface SharedRequest {
  id: string;
  title: string;
  requester: string;
  estimateHours: number;
  status: RequestStatus;
  queuePosition: number | null;
  projectedStartWeek: number | null;
  impact?: number;
  urgency?: number;
}

export interface SharedSnapshot {
  schemaVersion: 1;
  publishedAt: string;
  hoursPerWeek: number;
  totalQueuedHours: number;
  queuedWeeks: number;
  includesScores: boolean;
  requests: SharedRequest[];
}
