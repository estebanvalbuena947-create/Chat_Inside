import { Controller, Get, Inject } from '@nestjs/common';
import { SupabaseServerClientFactory } from './infrastructure/supabase-server-client.factory';

@Controller()
export class AppController {
  constructor(
    @Inject(SupabaseServerClientFactory)
    private readonly supabaseServerClientFactory: SupabaseServerClientFactory
  ) {}

  @Get('health')
  health(): { status: 'ok'; service: 'api'; supabase: 'configured' | 'not_configured' } {
    return {
      status: 'ok',
      service: 'api',
      supabase: this.supabaseServerClientFactory.isConfigured() ? 'configured' : 'not_configured'
    };
  }
}
