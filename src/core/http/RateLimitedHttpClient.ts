import type { HttpClient, HttpRequest, HttpResponse } from '../ports/HttpClient';

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export class RateLimitedHttpClient implements HttpClient {
  private nextAt = 0;

  constructor(
    private readonly inner: HttpClient,
    private readonly minIntervalMs = 350,
  ) {}

  async request(request: HttpRequest): Promise<HttpResponse> {
    const now = Date.now();
    const waitMs = Math.max(0, this.nextAt - now);
    this.nextAt = now + waitMs + this.minIntervalMs;
    if (waitMs > 0) await delay(waitMs);
    return this.inner.request(request);
  }
}
