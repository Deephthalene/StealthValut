type JwtBase = { exp?: number };

export function decodeJWT<T extends JwtBase>(token: string): T | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string | null): boolean {
  if (!token) return true;
  try {
    const decoded = decodeJWT(token);
    if (!decoded || decoded.exp == null) return true;
    return decoded.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}
