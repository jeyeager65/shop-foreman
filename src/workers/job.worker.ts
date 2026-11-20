/// <reference lib="webworker" />
import { type Job, buildJob } from '@/job/buildJob';
import type { Project, ShopProfile } from '@/model';

export interface JobRequest {
  id: number;
  project: Project;
  shop: ShopProfile;
}
export interface JobResponse {
  id: number;
  job?: Job;
  error?: string;
}

/** Plan, toolpaths and G-code off the main thread. */
self.onmessage = (event: MessageEvent<JobRequest>) => {
  const { id, project, shop } = event.data;
  try {
    self.postMessage({ id, job: buildJob(project, shop) } satisfies JobResponse);
  } catch (e) {
    self.postMessage({ id, error: e instanceof Error ? e.message : String(e) } satisfies JobResponse);
  }
};
