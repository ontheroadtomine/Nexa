import { PigAgentApi } from '../main/preload';

declare global {
  interface Window {
    pigagent: PigAgentApi;
  }
}

export {};
