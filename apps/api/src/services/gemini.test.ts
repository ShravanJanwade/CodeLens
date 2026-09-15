import test from 'node:test';
import assert from 'node:assert/strict';
import { createLLMProvider } from '@codelens/ai';

test('Gemini keeps key out of URL, bounds context/output and handles quota', async () => {
  const previous = globalThis.fetch;
  const oldKey = process.env.GEMINI_API_KEY,
    oldModel = process.env.GEMINI_MODEL;
  process.env.GEMINI_API_KEY = 'test-only-key';
  process.env.GEMINI_MODEL = 'test-model';
  try {
    let captured: RequestInit | undefined;
    globalThis.fetch = async (input, init) => {
      assert.ok(!String(input).includes('test-only-key'));
      captured = init;
      return Response.json({ candidates: [{ content: { parts: [{ text: 'Source-backed explanation' }] } }] });
    };
    const provider = createLLMProvider('gemini');
    assert.equal(
      await provider.generate('x'.repeat(100_000), { maxTokens: 9000 }),
      'Source-backed explanation',
    );
    const body = JSON.parse(String(captured!.body));
    assert.equal(body.contents[0].parts[0].text.length, 45_000);
    assert.equal(body.generationConfig.maxOutputTokens, 2048);
    assert.ok(captured!.signal);
    let attempts = 0;
    globalThis.fetch = async () =>
      ++attempts === 1
        ? new Response('temporary', { status: 503 })
        : Response.json({ candidates: [{ content: { parts: [{ text: 'Recovered answer' }] } }] });
    assert.equal(await provider.generate('question'), 'Recovered answer');
    assert.equal(attempts, 2);
    globalThis.fetch = async () => new Response('quota', { status: 429 });
    await assert.rejects(provider.generate('question'), /quota exhausted/);
  } finally {
    globalThis.fetch = previous;
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
    if (oldModel === undefined) delete process.env.GEMINI_MODEL;
    else process.env.GEMINI_MODEL = oldModel;
  }
});
test('Gemini rejects an unapproved tool and invalid experiment parameters', async () => {
  const previous = globalThis.fetch;
  process.env.GEMINI_API_KEY = 'test-only-key';
  process.env.GEMINI_MODEL = 'test-model';
  try {
    const tools = [
      {
        name: 'run_approved_experiment',
        description: 'Bounded probe',
        type: 'mutating' as const,
        parameters: {
          pageSize: { type: 'string' as const, required: true, enum: ['5', '10'], description: 'Page size' },
        },
      },
    ];
    globalThis.fetch = async () =>
      Response.json({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify({ toolName: 'shell', arguments: {}, reasoning: 'No' }) }],
            },
          },
        ],
      });
    await assert.rejects(createLLMProvider('gemini').toolCall('probe', tools), /Invalid tool/);
    globalThis.fetch = async () =>
      Response.json({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    toolName: 'run_approved_experiment',
                    arguments: { pageSize: '1000' },
                    reasoning: 'No',
                  }),
                },
              ],
            },
          },
        ],
      });
    await assert.rejects(createLLMProvider('gemini').toolCall('probe', tools), /Invalid tool argument/);
  } finally {
    globalThis.fetch = previous;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_MODEL;
  }
});
