export type DouyuAuthKind = 'web' | 'yuba' | 'android';

export interface DouyuAuthContext {
  headers(kind: DouyuAuthKind): Promise<Record<string, string>>;
  csrfToken(): Promise<string>;
  /** Douyu web CSRF value (`acf_ccn`), required by fan-club mutation APIs. */
  fansCtn(forceRefresh?: boolean): Promise<string>;
}
