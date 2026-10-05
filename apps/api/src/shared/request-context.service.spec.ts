import { RequestContextService } from './request-context.service';

describe('RequestContextService', () => {
  let service: RequestContextService;

  beforeEach(() => {
    service = new RequestContextService();
  });

  it('вне запроса возвращает пустой контекст', () => {
    expect(service.current()).toEqual({});
    expect(service.requestId).toBeUndefined();
    expect(service.actorUserId).toBeUndefined();
  });

  it('возвращает контекст внутри run', () => {
    const result = service.run({ requestId: 'req-1', ipAddress: '127.0.0.1' }, () => ({
      requestId: service.requestId,
      ip: service.current().ipAddress,
    }));

    expect(result).toEqual({ requestId: 'req-1', ip: '127.0.0.1' });
  });

  it('изолирует параллельные контексты', async () => {
    const read = (id: string) =>
      service.run({ requestId: id }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return service.requestId;
      });

    const [first, second] = await Promise.all([read('req-a'), read('req-b')]);

    expect(first).toBe('req-a');
    expect(second).toBe('req-b');
  });

  it('patch дополняет контекст и не падает вне запроса', () => {
    service.run({ requestId: 'req-2' }, () => {
      service.patch({ actorUserId: 'user-1' });
      expect(service.actorUserId).toBe('user-1');
    });

    expect(() => service.patch({ actorUserId: 'user-2' })).not.toThrow();
  });
});
