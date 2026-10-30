import { DEFAULT_OWNER_DATA, STORAGE_KEY, parseOwnerData } from "./data";
import type { OwnerData } from "./types";

export interface OwnerLoadResult {
  data: OwnerData;
  error: string | null;
}

export function loadOwnerData(): OwnerLoadResult {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return {
      data: saved ? parseOwnerData(JSON.parse(saved)) : DEFAULT_OWNER_DATA,
      error: null,
    };
  } catch (error) {
    return {
      data: DEFAULT_OWNER_DATA,
      error: error instanceof Error ? error.message : "Saved data could not be loaded.",
    };
  }
}

export function saveOwnerData(data: OwnerData): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
