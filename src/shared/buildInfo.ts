export interface BuildInfo {
  version: string;
  buildId: string;
  builtAt: string;
  revision: string | null;
  localChanges: string[];
  notes: string[];
  commits: Array<{ hash: string; subject: string }>;
}
