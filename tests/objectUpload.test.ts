import assert from 'node:assert/strict';
import { test } from 'node:test';
import { uploadObject } from '../src/services/objectUpload.ts';

test('uploads the original binary Blob and returns the object ID', async () => {
  const file = new Blob([new Uint8Array([0, 255, 128, 13, 10])]);
  const id = await uploadObject(file, async (url, options) => {
    assert.equal(url, '/api/object');
    assert.equal(options?.method, 'POST');
    assert.equal(options?.body, file);
    return Response.json({ id: 'binary-object' });
  });
  assert.equal(id, 'binary-object');
});

test('surfaces HTTP 413 plain-text errors', async () => {
  await assert.rejects(
    uploadObject(new Blob(), async () => new Response('Request body too large', { status: 413 })),
    /HTTP 413: Request body too large/,
  );
});

test('surfaces actionable JSON storage errors', async () => {
  await assert.rejects(
    uploadObject(new Blob(), async () => Response.json({
      error: 'object_upload_failed', message: 'Upload directory: Permission denied',
    }, { status: 500 })),
    /HTTP 500: Upload directory: Permission denied/,
  );
});

test('rejects missing IDs instead of sending a broken file message', async () => {
  for (const result of [{}, { id: '' }, { id: 42 }, null]) {
    await assert.rejects(
      uploadObject(new Blob(), async () => Response.json(result)),
      /valid object ID/,
    );
  }
});

test('retains network errors for the UI', async () => {
  await assert.rejects(
    uploadObject(new Blob(), async () => { throw new TypeError('Failed to fetch'); }),
    /Failed to fetch/,
  );
});

test('bounds error text shown in the UI', async () => {
  await assert.rejects(
    uploadObject(new Blob(), async () => new Response('x'.repeat(5000), { status: 502 })),
    (error: Error) => error.message.length < 520 && error.message.startsWith('HTTP 502:'),
  );
});
