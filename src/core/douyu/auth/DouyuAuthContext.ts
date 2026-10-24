export type DouyuAuthKind = 'web' | 'yuba' | 'android';

export interface DouyuAuthContext {
  headers(kind: DouyuAuthKind): Promise<Record<string, string>>;
  csrfToken(): Promise<string>;
}
