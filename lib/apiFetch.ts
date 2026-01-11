type FetchOptions = RequestInit & { 
  friendlyError?: string;
  timeout?: number; // ms
  retries?: number;
};

const DEFAULT_TIMEOUT = 20000; // 20s (AI generation can be slow)
const DEFAULT_RETRIES = 1; 

async function wait(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function apiFetch<T = any>(input: RequestInfo, init: FetchOptions = {}): Promise<T> {
  const { friendlyError, timeout = DEFAULT_TIMEOUT, retries = DEFAULT_RETRIES, headers, ...rest } = init;

  let lastError: any;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(input, {
        headers: {
          'Content-Type': 'application/json',
          ...(headers || {})
        },
        signal: controller.signal,
        ...rest,
      });
      clearTimeout(id);

      const raw = await response.text();
      let data: any;
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = raw;
      }

      if (!response.ok) {
        // 5xx errors are retryable
        if (response.status >= 500 && attempt < retries) {
           throw new Error(`Server Error ${response.status}`);
        }
        
        const serverMessage = typeof data === 'object' && data?.error ? data.error : undefined;
        const message = serverMessage || friendlyError || `요청 실패 (${response.status})`;
        throw new Error(message);
      }

      return data as T;

    } catch (error: any) {
      clearTimeout(id);
      lastError = error;
      
      const isAbort = error.name === 'AbortError';
      const isNetwork = error.message.includes('Network request failed') || error.message.includes('fetch failed');
      const isServerError = error.message.includes('Server Error');

      const isRetryable = attempt < retries && (isAbort || isNetwork || isServerError);

      if (isRetryable) {
        const delay = 1000 * Math.pow(2, attempt); // 1s, 2s...
        console.warn(`[apiFetch] Attempt ${attempt + 1} failed. Retrying in ${delay}ms...`, error.message);
        await wait(delay);
        continue;
      }
      
      break;
    }
  }

  // Final error handling
  if (lastError?.name === 'AbortError') {
     throw new Error(friendlyError ? `${friendlyError} (시간 초과)` : '요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.');
  }
  
  throw new Error(lastError?.message || friendlyError || '알 수 없는 오류가 발생했습니다.');
}
