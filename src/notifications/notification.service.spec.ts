import { NotificationService } from './notification.service.js';

describe('NotificationService', () => {
  it('registers and removes a push token without requiring Firebase credentials', async () => {
    const prisma = {
      pushToken: {
        upsert: vi.fn().mockResolvedValue({ id: 'token-1' }),
        deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };
    const service = new NotificationService(prisma as never);
    await expect(service.registerToken('user-1', { token: 'fcm-token', platform: 'web' })).resolves.toEqual({ id: 'token-1' });
    expect(prisma.pushToken.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { token: 'fcm-token' } }));
    await expect(service.removeToken('user-1', 'fcm-token')).resolves.toEqual({ count: 1 });
    expect(prisma.pushToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-1', token: 'fcm-token' } });
    await expect(service.sendToUsers(['user-1'], 'Title', 'Body')).resolves.toBe(0);
  });
});
