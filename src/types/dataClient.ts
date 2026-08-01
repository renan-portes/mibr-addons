export interface DataClient<TRequest, TResponse> {
  fetch(request: TRequest, signal: AbortSignal): Promise<TResponse>;
}
