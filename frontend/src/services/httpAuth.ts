import axios from 'axios';
import { api } from './api';
import { useAuthStore } from '../stores/authStore';

/**
 * Attach the bearer token to every outgoing request and clear the session on 401.
 *
 * This has to be installed on BOTH the shared `api` instance and the global
 * axios object: feature services in this project are split between the two
 * (services/api.ts uses the instance, barcodeApi/replenishmentApi call bare
 * axios), and interceptors registered on `axios` do not apply to instances
 * created with axios.create().
 */
export function installAuthInterceptors(): void {
  const targets = [axios, api];

  for (const target of targets) {
    target.interceptors.request.use((config) => {
      const token = useAuthStore.getState().token;
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    target.interceptors.response.use(
      (response) => response,
      (error) => {
        const status = error?.response?.status;
        // 401 means the token is missing, expired or invalid — drop the session
        // so the guard renders the login screen. 403 is a live session that
        // simply lacks access, so it is left for the page to report.
        if (status === 401 && useAuthStore.getState().token) {
          useAuthStore.getState().logout();
        }
        return Promise.reject(error);
      },
    );
  }
}
