export async function api(path, { method = 'GET', body, signal } = {}) {
  const headers = {};
  if (method !== 'GET') {
    const tokenResponse = await fetch('/api/auth/csrf', {
      credentials: 'same-origin',
      signal,
    });
    if (!tokenResponse.ok)
      throw new Error('Could not prepare a secure request. Please try again.');
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
}
