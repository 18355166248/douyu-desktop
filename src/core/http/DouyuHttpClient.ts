import type { HttpClient, HttpRequest, HttpResponse } from '../ports/HttpClient';
import { RateLimitedHttpClient } from './RateLimitedHttpClient';
import { RetryingHttpClient } from './RetryingHttpClient';

export interface DouyuHttpClientOptions {
  minIntervalMs?: number;
  maxAttempts?: number;
}

export class DouyuHttpClient implements HttpClient {
  private readonly inner: HttpClient;

  constructor(inner: HttpClient, options: DouyuHttpClientOptions = {}) {
    this.inner = new RetryingHttpClient(
      new RateLimitedHttpClient(inner, options.minIntervalMs ?? 350),
      options.maxAttempts ?? 2,
    );
  }

  request(request: HttpRequest): Promise<HttpResponse> {
    return this.inner.request(request);
  }
}
