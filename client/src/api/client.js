const TOKEN_KEY = 'hmis_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const t = getToken();
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(path, { ...options, headers });
  if (res.status === 401) {
    setToken(null);
    window.dispatchEvent(new Event('hmis:auth'));
  }
  const body = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    const msg = body?.error || res.statusText;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return body;
}
