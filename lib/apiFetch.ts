type FetchOptions = RequestInit & { friendlyError?: string };

export async function apiFetch<T = any>(input: RequestInfo, init: FetchOptions = {}): Promise<T> {
  const { friendlyError, headers, ...rest } = init;
  try {
    const response = await fetch(input, {
      headers: {
        'Content-Type': 'application/json',
        ...(headers || {})
      },
      ...rest,
    });

    const raw = await response.text();
    let data: any;
    try {
      data = raw ? JSON.parse(raw) : {};
    } catch {
      data = raw;
    }

    if (!response.ok) {
      const serverMessage = typeof data === 'object' && data?.error ? data.error : undefined;
      const message = serverMessage || friendlyError || '요청을 처리하지 못했습니다.';
      throw new Error(message);
    }

    return data as T;
  } catch (error: any) {
    if (error instanceof Error) {
      throw new Error(error.message || friendlyError || '네트워크 오류가 발생했습니다.');
    }
    throw new Error(friendlyError || '알 수 없는 오류가 발생했습니다.');
  }
}
