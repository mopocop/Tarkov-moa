import { ApolloClient, InMemoryCache, HttpLink, gql } from '@apollo/client';
import type { TarkovQuest, APICache } from './types';

const CACHE_KEY = 'tarkov_dev_quests_cache';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

const QUESTS_QUERY = gql`
  query GetQuests {
    quests {
      id
      name
      description
      map {
        name
      }
      giver {
        name
      }
      trader {
        name
      }
      wikiLink
    }
  }
`;

export class TarkovDevClient {
  private client: InstanceType<typeof ApolloClient>;
  private questsCache: APICache<TarkovQuest[]> | null = null;

  constructor() {
    this.client = new ApolloClient({
      ssrMode: typeof window === 'undefined',
      link: new HttpLink({
        uri: 'https://api.tarkov.dev/graphql',
        credentials: 'same-origin',
      }),
      cache: new InMemoryCache(),
    });
    this.loadCacheFromStorage();
  }

  private loadCacheFromStorage(): void {
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        this.questsCache = JSON.parse(cached) as APICache<TarkovQuest[]>;
        if (!this.isCacheValid()) {
          this.questsCache = null;
          localStorage.removeItem(CACHE_KEY);
        }
      }
    } catch (error) {
      console.warn('Failed to load quests cache:', error);
      this.questsCache = null;
    }
  }

  private saveCacheToStorage(): void {
    try {
      if (this.questsCache) {
        localStorage.setItem(CACHE_KEY, JSON.stringify(this.questsCache));
      }
    } catch (error) {
      console.warn('Failed to save quests cache:', error);
    }
  }

  private isCacheValid(): boolean {
    if (!this.questsCache) return false;
    const age = Date.now() - this.questsCache.timestamp;
    return age < CACHE_DURATION;
  }

  async getQuests(): Promise<TarkovQuest[]> {
    // Return cached data if valid
    if (this.questsCache && this.isCacheValid()) {
      return this.questsCache.data;
    }

    try {
      const result = await this.client.query({
        query: QUESTS_QUERY,
      });

      const quests = (result.data as Record<string, TarkovQuest[]>).quests;
      this.questsCache = {
        data: quests,
        timestamp: Date.now(),
      };
      this.saveCacheToStorage();
      return quests;
    } catch (error) {
      throw new Error(`Failed to fetch quests: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  clearCache(): void {
    this.questsCache = null;
    localStorage.removeItem(CACHE_KEY);
  }
}
