import axios, { AxiosError } from 'axios';
import type { AxiosInstance } from 'axios';
import type { TarkovTrackerProgress } from './types';

const BASE_URL = 'https://tarkovtracker.io/api/v2';
const PROGRESS_CACHE_KEY = 'tt_progress_cache_v2';

export class UnauthorizedError extends Error {
  constructor() {
    super('TarkovTracker token rejected (401). Re-enter token.');
    this.name = 'UnauthorizedError';
  }
}

export class TarkovTrackerClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor(token?: string) {
    this.token = token ?? null;
    this.client = axios.create({
      baseURL: BASE_URL,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }

  setToken(token: string): void {
    this.token = token;
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  hasToken(): boolean {
    return !!this.token;
  }

  async validateToken(): Promise<boolean> {
    if (!this.token) return false;
    try {
      await this.client.get('/token');
      return true;
    } catch (error) {
      if ((error as AxiosError).response?.status === 401) return false;
      throw error;
    }
  }

  async getProgress(): Promise<TarkovTrackerProgress> {
    if (!this.token) throw new Error('Token not set');
    try {
      const response = await this.client.get<{ data: TarkovTrackerProgress }>('/progress');
      this.saveCachedProgress(response.data.data);
      return response.data.data;
    } catch (error) {
      const status = (error as AxiosError).response?.status;
      if (status === 401) throw new UnauthorizedError();
      // Network failure → fall back to last-good cache if available.
      const cached = this.loadCachedProgress();
      if (cached) return cached.data;
      throw new Error(
        `Failed to fetch progress: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  getLastSynced(): number | null {
    return this.loadCachedProgress()?.timestamp ?? null;
  }

  private saveCachedProgress(data: TarkovTrackerProgress): void {
    try {
      localStorage.setItem(
        PROGRESS_CACHE_KEY,
        JSON.stringify({ data, timestamp: Date.now() }),
      );
    } catch {
      // ignore quota / storage errors
    }
  }

  private loadCachedProgress():
    | { data: TarkovTrackerProgress; timestamp: number }
    | null {
    try {
      const raw = localStorage.getItem(PROGRESS_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}
