export async function api(path, { method = 'GET', body, signal } = {}) {
  try {
    const headers = {};
    if (method !== 'GET') {
      const tokenResponse = await fetch('/api/auth/csrf', {
        credentials: 'same-origin',
        signal,
      });
      if (!tokenResponse.ok)
        throw new Error(
          'Could not prepare a secure request. Please try again.',
        );
      const { csrfToken } = await tokenResponse.json();
      headers['X-CSRF-Token'] = csrfToken;
      headers['Content-Type'] = 'application/json';
    }
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(
        data.error?.message ?? 'Request failed. Please try again.',
      );
      error.status = response.status;
      throw error;
    }
    return data;
  } catch (error) {
    if (error.name === 'AbortError' || error.status !== undefined) throw error;
    if (error instanceof TypeError)
      throw new Error(
        'Could not reach SlotSure. Check your connection and try again.',
        { cause: error },
      );
    if (error instanceof SyntaxError)
      throw new Error(
        'SlotSure returned an unexpected response. Please try again.',
        { cause: error },
      );
    throw error;
  }
}
