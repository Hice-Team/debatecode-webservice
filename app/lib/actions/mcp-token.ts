'use server';

// debateNetwork(MCP)·debateBridge 연동 토큰 발급/폐기.
// 평문 토큰은 발급 응답으로 "한 번만" 반환하고 서버에는 해시만 저장한다.
import { revalidatePath } from 'next/cache';
import { verifySession } from '@/app/lib/dal';
import { prisma } from '@/app/lib/prisma';
import { newToken, sha256Hex, tokenPrefix } from '@/app/lib/mcp-auth';

export interface McpTokenState {
  token?: string; // 평문 — 화면에 1회만 노출
  error?: string;
}

export async function generateMcpToken(): Promise<McpTokenState> {
  const { userId } = await verifySession();
  const token = newToken();
  const hash = await sha256Hex(token);
  await prisma.user.update({
    where: { id: userId },
    data: { mcpTokenHash: hash, mcpTokenPrefix: tokenPrefix(token), mcpTokenCreatedAt: new Date() },
  });
  revalidatePath('/settings/ai');
  return { token };
}

export async function revokeMcpToken(): Promise<void> {
  const { userId } = await verifySession();
  await prisma.user.update({
    where: { id: userId },
    data: { mcpTokenHash: null, mcpTokenPrefix: null, mcpTokenCreatedAt: null },
  });
  revalidatePath('/settings/ai');
}
