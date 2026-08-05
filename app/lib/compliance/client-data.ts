"use client";

export const PROJECT_BUSINESS_STORAGE_KEYS = [
  "interview-lab.mock-interview.sessions",
  "interview-lab.mock-interview.language",
  "interview-lab.custom-interview.sessions",
  "interview-lab.resume-studio.session",
  "interview-lab.resume-studio.interview-handoff",
  "interview-lab.client-id"
] as const;

export type ProjectStorage = Pick<Storage, "getItem" | "removeItem">;

export type ClearProjectDataResult = {
  removedKeys: string[];
  failedKeys: string[];
};

export function clearProjectBusinessData(storage: ProjectStorage): ClearProjectDataResult {
  const removedKeys: string[] = [];
  const failedKeys: string[] = [];

  for (const key of PROJECT_BUSINESS_STORAGE_KEYS) {
    try {
      const existed = storage.getItem(key) !== null;
      storage.removeItem(key);
      if (existed) removedKeys.push(key);
    } catch {
      failedKeys.push(key);
    }
  }

  return { removedKeys, failedKeys };
}
