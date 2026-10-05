import { Controller, Get, Headers, Inject, Param } from '@nestjs/common';
import { ToolConversationService } from './tool-conversation.service';

/**
 * Extremos que consume el bot a traves de n8n.
 *
 * Se autentican con la credencial de maquina (cabecera Authorization), no con la sesion de una
 * persona: por eso no llevan el espacio en la ruta. La credencial ya sabe a que espacio pertenece.
 */
@Controller('v1/tools/conversations')
export class ToolConversationsController {
  constructor(@Inject(ToolConversationService) private readonly service: ToolConversationService) {}

  @Get(':conversationId')
  async read(
    @Param('conversationId') conversationId: string,
    @Headers('authorization') authorization: string | undefined
  ): Promise<unknown> {
    return this.service.read(authorization, conversationId);
  }
}
