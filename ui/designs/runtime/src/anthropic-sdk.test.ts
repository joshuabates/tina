import { describe, it, expect } from 'vitest';

describe('Anthropic SDK', () => {
  it('should be available for import', async () => {
    // This test verifies that the Anthropic SDK is installed and can be imported
    const Anthropic = await import('@anthropic-ai/sdk').then(m => m.default);
    expect(Anthropic).toBeDefined();
  });

  it('should be able to instantiate Anthropic client', async () => {
    // Verify that we can create an Anthropic client instance
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({
      apiKey: 'test-key', // Using test key for instantiation verification
    });
    expect(client).toBeDefined();
    expect(client.messages).toBeDefined();
  });
});
