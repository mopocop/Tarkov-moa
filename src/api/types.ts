// TarkovTracker API types
export interface TarkovTrackerTask {
  id: string;
  name: string;
  map?: string;
  status: 'in-progress' | 'completed' | 'failed';
}

export interface TarkovTrackerUser {
  username: string;
  userId: string;
}

// tarkov.dev GraphQL types
export interface TarkovQuest {
  id: string;
  name: string;
  description?: string;
  map?: {
    name: string;
  };
  giver?: {
    name: string;
  };
  trader?: {
    name: string;
  };
  wikiLink?: string;
}

export interface APICache<T> {
  data: T;
  timestamp: number;
}

export interface ActiveTask {
  id: string;
  name: string;
  source: 'tracker' | 'quest';
  map?: string;
  description?: string;
}
