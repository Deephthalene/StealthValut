import { toastNotification } from '@/stores/useToastStore';
import axios from 'axios';
import { isTokenExpired } from './jwt';

const baseURL = import.meta.env.VITE_API_BASE_URL ?? '';

const api = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

api.interceptors.request.use(
  async (config) => {
    const token = localStorage.getItem('token');

    if (token && isTokenExpired(token)) {
      localStorage.removeItem('token');
      const { useAuthStore } = await import('@/stores/useAuthStore');
      useAuthStore.getState().logout();
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
      return Promise.reject(new Error('Token expired'));
    }

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }

    return config;
  },
  (error) => Promise.reject(error),
);

const TOKEN_EXPIRED_CODES = ['EXPIRED_ACCESS_TOKEN', 'INVALID_ACCESS_TOKEN'];

api.interceptors.response.use(
  async (response) => {
    const errorCode = response.data?.error?.code;
    const url =
      typeof response.config.url === 'string' ? response.config.url : '';

    if (errorCode && TOKEN_EXPIRED_CODES.includes(errorCode)) {
      if (url.includes('/reissue') || url.includes('/logout')) {
        return response;
      }
      const config = response.config as typeof response.config & {
        _retry?: boolean;
      };
      if (config._retry) return response;

      try {
        const reissueResponse = await api.post('/api/auth-service/reissue', {});
        if (reissueResponse.data?.result) {
          config._retry = true;
          return api.request(config);
        }
      } catch {
        /* reissue 실패 */
      }

      await api.post('/api/auth-service/logout', {}).catch(() => {});
      const { useAuthStore } = await import('@/stores/useAuthStore');
      useAuthStore.getState().logout();
      return Promise.reject(new Error('Token expired'));
    }

    if (!response?.data) {
      toastNotification.error(
        '서버에 오류가 발생했습니다. 관리자에게 문의바랍니다.',
      );
      return Promise.reject(new Error('Empty response'));
    }

    return response;
  },
  async (error) => {
    toastNotification.error(
      '서버에 오류가 발생했습니다. 관리자에게 문의바랍니다.',
    );
    return Promise.reject(error);
  },
);

export default api;
