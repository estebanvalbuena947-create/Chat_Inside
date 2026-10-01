import { ServiceUnavailableException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { SupabaseServerClientFactory } from './supabase-server-client.factory';

describe('SupabaseServerClientFactory', () => {
  const factory = new SupabaseServerClientFactory();

  it('does not consider a publishable-only configuration ready for server data access', () => {
    expect(
      factory.isConfigured({
        SUPABASE_URL: 'https://example.supabase.co',
        SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_public'
      })
    ).toBe(false);
  });

  it('fails closed when the server secret is absent', () => {
    expect(() => factory.create({ SUPABASE_URL: 'https://example.supabase.co' })).toThrow(
      ServiceUnavailableException
    );
  });

  it('creates a server-only client only from a complete server configuration', () => {
    expect(
      factory.isConfigured({
        SUPABASE_SERVICE_ROLE_KEY: 'server-secret-for-test-only',
        SUPABASE_URL: 'https://example.supabase.co'
      })
    ).toBe(true);
  });

  it('accepts the current Supabase secret-key format for server configuration', () => {
    expect(
      factory.isConfigured({
        SUPABASE_SECRET_KEY: 'sb_secret_server_only',
        SUPABASE_URL: 'https://example.supabase.co'
      })
    ).toBe(true);
  });
});
