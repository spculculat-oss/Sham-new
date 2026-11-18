import assert from 'node:assert/strict';
import test from 'node:test';
import express from 'express';
import { createMapsRouter } from '../server/maps';
import { attachLiveVoiceServer } from '../server/liveVoice';

async function withServer(router: express.Router, run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

test('GET /api/maps/config reflects VITE_GOOGLE_MAPS_API_KEY configuration safely', async () => {
  await withServer(createMapsRouter({ VITE_GOOGLE_MAPS_API_KEY: 'test-maps-key' }), async (base) => {
    const res = await fetch(`${base}/api/maps/config`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as { configured: boolean; apiKey: string };
    assert.equal(data.configured, true);
    assert.equal(data.apiKey, 'test-maps-key');
  });

  await withServer(createMapsRouter({}), async (base) => {
    const res = await fetch(`${base}/api/maps/config`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as { configured: boolean; apiKey: string };
    assert.equal(data.configured, false);
    assert.equal(data.apiKey, '');
  });
});

test('POST /api/maps/grounding validates queries and handles missing server key', async () => {
  await withServer(createMapsRouter({}), async (base) => {
    const empty = await fetch(`${base}/api/maps/grounding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '   ' }),
    });
    assert.equal(empty.status, 400);

    const tooLong = await fetch(`${base}/api/maps/grounding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'a'.repeat(501) }),
    });
    assert.equal(tooLong.status, 400);

    const unconfigured = await fetch(`${base}/api/maps/grounding`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'Grasse perfumery', lat: 43.65, lng: 6.92 }),
    });
    assert.equal(unconfigured.status, 503);
  });
});

test('attachLiveVoiceServer exports a valid upgrade handler initializer', () => {
  assert.equal(typeof attachLiveVoiceServer, 'function');
});
