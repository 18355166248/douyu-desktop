export interface HttpRequest {
  url: string;
  method?: 'GET' | 'POST' | undefined;
  headers?: Record<string, string> | undefined;
  body?: string | undefined;
  signal?: AbortSignal | undefined;
  timeoutMs?: number | undefined;
  retry?: 'safe' | 'none' | undefined;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  text(): Promise<string>;
  json<T>(): Promise<T>;
}

export interface HttpClient {
  request(request: HttpRequest): Promise<HttpResponse>;
}
