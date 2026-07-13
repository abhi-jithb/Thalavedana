import type { ThalavedanaApi } from '@shared/api';

declare global {
  interface Window {
    thalavedana: ThalavedanaApi;
  }
}

export {};