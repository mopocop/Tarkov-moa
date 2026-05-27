import type { ActiveTask, TarkovQuest } from '../api/types';
import { TarkovTrackerClient } from '../api/tarkovtracker';
import { TarkovDevClient } from '../api/tarkov-dev';

export class ActiveTasksService {
  private trackerClient: TarkovTrackerClient;
  private devClient: TarkovDevClient;
  private questMap: Map<string, TarkovQuest> = new Map();

  constructor(trackerClient: TarkovTrackerClient, devClient: TarkovDevClient) {
    this.trackerClient = trackerClient;
    this.devClient = devClient;
  }

  async initialize(): Promise<void> {
    try {
      const quests = await this.devClient.getQuests();
      this.questMap.clear();
      quests.forEach((quest) => {
        this.questMap.set(quest.id, quest);
      });
    } catch (error) {
      console.warn('Failed to initialize quest data:', error);
    }
  }

  async deriveActiveTasks(): Promise<ActiveTask[]> {
    const activeTasks: ActiveTask[] = [];

    try {
      // Get in-progress tasks from TarkovTracker
      const trackerTasks = await this.trackerClient.getTasks();
      const inProgressTasks = trackerTasks.filter((task) => task.status === 'in-progress');

      inProgressTasks.forEach((task) => {
        activeTasks.push({
          id: `tracker-${task.id}`,
          name: task.name,
          source: 'tracker',
          map: task.map,
        });
      });
    } catch (error) {
      console.warn('Failed to fetch tracker tasks:', error);
    }

    // Optionally enhance with quest data from tarkov.dev
    // This would enrich tracker tasks with additional quest information
    return activeTasks;
  }

  getQuestByName(questName: string): TarkovQuest | undefined {
    for (const quest of this.questMap.values()) {
      if (quest.name.toLowerCase() === questName.toLowerCase()) {
        return quest;
      }
    }
    return undefined;
  }

  getAllQuests(): TarkovQuest[] {
    return Array.from(this.questMap.values());
  }
}
