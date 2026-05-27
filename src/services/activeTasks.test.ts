import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ActiveTasksService } from './activeTasks';
import { TarkovTrackerClient } from '../api/tarkovtracker';
import { TarkovDevClient } from '../api/tarkov-dev';

describe('ActiveTasksService', () => {
  let service: ActiveTasksService;
  let mockTrackerClient: TarkovTrackerClient;
  let mockDevClient: TarkovDevClient;

  beforeEach(() => {
    mockTrackerClient = new TarkovTrackerClient();
    mockDevClient = new TarkovDevClient();
    service = new ActiveTasksService(mockTrackerClient, mockDevClient);
  });

  it('should initialize without errors', async () => {
    vi.spyOn(mockDevClient, 'getQuests').mockResolvedValue([]);
    await expect(service.initialize()).resolves.not.toThrow();
  });

  it('should derive active tasks from tracker', async () => {
    const mockTasks = [
      {
        id: 'task-1',
        name: 'Find Intel',
        status: 'in-progress' as const,
        map: 'Woods',
      },
      {
        id: 'task-2',
        name: 'Survive on Customs',
        status: 'completed' as const,
        map: 'Customs',
      },
    ];

    vi.spyOn(mockTrackerClient, 'getTasks').mockResolvedValue(mockTasks);
    vi.spyOn(mockDevClient, 'getQuests').mockResolvedValue([]);

    await service.initialize();
    const active = await service.deriveActiveTasks();

    expect(active).toHaveLength(1);
    expect(active[0].name).toBe('Find Intel');
    expect(active[0].source).toBe('tracker');
    expect(active[0].map).toBe('Woods');
  });

  it('should handle tracker errors gracefully', async () => {
    vi.spyOn(mockTrackerClient, 'getTasks').mockRejectedValue(new Error('API error'));
    vi.spyOn(mockDevClient, 'getQuests').mockResolvedValue([]);

    await service.initialize();
    const active = await service.deriveActiveTasks();

    // Should return empty array without throwing
    expect(active).toEqual([]);
  });

  it('should find quest by name', async () => {
    const mockQuests = [
      {
        id: 'quest-1',
        name: 'Find Intel Documents',
        map: { name: 'Woods' },
      },
    ];

    vi.spyOn(mockDevClient, 'getQuests').mockResolvedValue(mockQuests as any);
    await service.initialize();

    const quest = service.getQuestByName('Find Intel Documents');
    expect(quest).toBeDefined();
    expect(quest?.id).toBe('quest-1');
  });

  it('should find quest by name case-insensitively', async () => {
    const mockQuests = [
      {
        id: 'quest-1',
        name: 'Find Intel Documents',
      },
    ];

    vi.spyOn(mockDevClient, 'getQuests').mockResolvedValue(mockQuests as any);
    await service.initialize();

    const quest = service.getQuestByName('find intel documents');
    expect(quest).toBeDefined();
  });

  it('should return all quests', async () => {
    const mockQuests = [
      { id: 'quest-1', name: 'Quest One' },
      { id: 'quest-2', name: 'Quest Two' },
    ];

    vi.spyOn(mockDevClient, 'getQuests').mockResolvedValue(mockQuests as any);
    await service.initialize();

    const all = service.getAllQuests();
    expect(all).toHaveLength(2);
  });
});
