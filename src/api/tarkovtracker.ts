import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type { TarkovTrackerTask, TarkovTrackerUser } from './types';

export class TarkovTrackerClient {
  private client: AxiosInstance;
  private token: string | null = null;

  constructor(token?: string) {
    this.token = token || null;
    this.client = axios.create({
      baseURL: 'https://api.tarkovtracker.io',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }

  setToken(token: string): void {
    this.token = token;
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  async getUser(): Promise<TarkovTrackerUser> {
    if (!this.token) {
      throw new Error('Token not set');
    }
    try {
      const response = await this.client.get<TarkovTrackerUser>('/user');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch user: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getTasks(): Promise<TarkovTrackerTask[]> {
    if (!this.token) {
      throw new Error('Token not set');
    }
    try {
      const response = await this.client.get<TarkovTrackerTask[]>('/tasks');
      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch tasks: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async updateTaskStatus(
    taskId: string,
    status: 'in-progress' | 'completed' | 'failed'
  ): Promise<TarkovTrackerTask> {
    if (!this.token) {
      throw new Error('Token not set');
    }
    try {
      const response = await this.client.patch<TarkovTrackerTask>(`/tasks/${taskId}`, {
        status,
      });
      return response.data;
    } catch (error) {
      throw new Error(`Failed to update task: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
