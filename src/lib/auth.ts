const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID; // User needs to replace this
const REDIRECT_URI = import.meta.env.VITE_GOOGLE_REDIRECT_URI;

export interface AuthData {
  accessToken: string;
  refreshToken?: string;
  email: string;
  name: string;
  picture: string;
  expiresAt: number;
}

const AUTH_STORAGE_KEY = 'gmail_user_info';

export const getAuthData = (): AuthData | null => {
  const raw = localStorage.getItem(AUTH_STORAGE_KEY);
  if (!raw) return null;

  let authData: AuthData;

  try {
    authData = JSON.parse(raw);
  } catch (e) {
    // corrupted JSON → clear
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }

  // Validate required fields
  if (!authData.accessToken || !authData.refreshToken || !authData.email) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }

  // Validate expiresAt
  if (
    typeof authData.expiresAt !== 'number' ||
    Number.isNaN(authData.expiresAt) ||
    authData.expiresAt <= 0
  ) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }

  // Check token expiry
  if (Date.now() >= authData.expiresAt) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }

  return authData;
};

export const setAuthData = (data: AuthData): void => {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data));
};

export const clearAuthData = (): void => {
  localStorage.removeItem(AUTH_STORAGE_KEY);
};

export const initiateGoogleAuth = (): void => {
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');

  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'https://mail.google.com/');
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent'); // IMPORTANT

  window.location.href = authUrl.toString();
};
