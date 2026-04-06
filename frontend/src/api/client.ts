import ky, { type HTTPError } from 'ky';
import { ZodError } from 'zod';
import { API_URL, AUTH_STORAGE_KEY } from '@/constants';

let isRedirectingToLogin = false;

export const apiClient = ky.create({
  prefixUrl: API_URL,
  hooks: {
    beforeRequest: [
      (request) => {
        const apiKey = sessionStorage.getItem(AUTH_STORAGE_KEY);
        if (apiKey) {
          request.headers.set('X-API-Key', apiKey);
        }
      },
    ],
    afterResponse: [
      (_request, _options, response) => {
        if (response.status === 401 && !isRedirectingToLogin) {
          isRedirectingToLogin = true;
          sessionStorage.removeItem(AUTH_STORAGE_KEY);
          window.location.href = '/login';
        }
        return response;
      },
    ],
  },
  retry: 0,
});

export function parseApiError(error: unknown): string {
  if (error instanceof ZodError) {
    return 'El servidor devolvió datos con un formato inesperado. Intenta recargar la página.';
  }
  if (error instanceof Error && 'response' in error) {
    const httpError = error as HTTPError;
    const status = httpError.response.status;
    if (status === 429) return 'Demasiadas solicitudes, espera unos segundos.';
    if (status === 404) return 'Recurso no encontrado.';
    if (status === 401) return 'API key inválida o expirada.';
    if (status === 410) return 'Export expirado, genera uno nuevo.';
    if (status === 422) return 'No hay spools completados para exportar.';
    if (status >= 500) return 'Error del servidor. Intenta más tarde.';
    return 'Error inesperado.';
  }
  if (error instanceof TypeError && error.message === 'Failed to fetch') {
    return 'Sin conexión al servidor.';
  }
  return 'Error inesperado.';
}

export function xhrUpload(
  url: string,
  formData: FormData,
  apiKey: string,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('X-API-Key', apiKey);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText) as unknown;
        resolve({ status: xhr.status, body });
      } catch {
        resolve({ status: xhr.status, body: null });
      }
    };

    xhr.onerror = () => reject(new TypeError('Failed to fetch'));
    xhr.ontimeout = () => reject(new Error('Upload timeout'));

    if (signal) {
      signal.addEventListener('abort', () => xhr.abort());
      if (signal.aborted) {
        xhr.abort();
        reject(new DOMException('Aborted', 'AbortError'));
        return;
      }
    }

    xhr.send(formData);
  });
}
