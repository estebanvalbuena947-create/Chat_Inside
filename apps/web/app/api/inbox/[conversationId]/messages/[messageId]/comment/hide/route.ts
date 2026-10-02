import { NextRequest, NextResponse } from 'next/server';
import { callCommentApi } from '../../../../../../../../lib/comment-actions';

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string; messageId: string }> }
): Promise<NextResponse> {
  const { conversationId, messageId } = await context.params;
  const respuesta = await callCommentApi({
    body: await request.json().catch(() => ({})),
    apiPath: `/conversations/${conversationId}/messages/${messageId}/comment/hide`,
    method: 'POST'
  });
  return NextResponse.json(respuesta.body, { status: respuesta.status });
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ conversationId: string; messageId: string }> }
): Promise<NextResponse> {
  const { conversationId, messageId } = await context.params;
  const respuesta = await callCommentApi({
    apiPath: `/conversations/${conversationId}/messages/${messageId}/comment/hide`,
    method: 'DELETE'
  });
  return NextResponse.json(respuesta.body, { status: respuesta.status });
}
