import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchZernioWhatsappMedia } from './conversation-media-storage';

const originalKey = process.env.ZERNIO_API_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.ZERNIO_API_KEY;
  else process.env.ZERNIO_API_KEY = originalKey;
  vi.unstubAllGlobals();
});

describe('WhatsApp media from Zernio', () => {
  it('uses only the provider endpoint constructed from account and media IDs', async () => {
    process.env.ZERNIO_API_KEY = 'test-key';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(Buffer.from([0x49, 0x44, 0x33, 0x01]), {
        headers: { 'content-length': '4' },
        status: 200
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchZernioWhatsappMedia({
        accountId: 'account 1',
        maxBytes: 100,
        mediaId: 'media/1',
        timeoutMs: 1_000
      })
    ).resolves.toMatchObject({ contentType: 'audio/mpeg', extension: 'mp3' });

    const [endpoint, options] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(endpoint.toString()).toBe(
      'https://zernio.com/api/v1/whatsapp/media/media%2F1?accountId=account+1'
    );
    expect(options).toMatchObject({
      headers: { Authorization: 'Bearer test-key' },
      redirect: 'error'
    });
  });

  it('does not make a request without the server-only Zernio key', async () => {
    delete process.env.ZERNIO_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      fetchZernioWhatsappMedia({
        accountId: 'account-1',
        maxBytes: 100,
        mediaId: 'media-1',
        timeoutMs: 1_000
      })
    ).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
