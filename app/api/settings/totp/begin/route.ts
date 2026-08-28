import { NextResponse } from 'next/server';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { requireApiSession } from '@/app/lib/dal';
import { prisma } from '@/app/lib/prisma';
import { encryptSecret } from '@/app/lib/crypto';

// 인증 앱(TOTP) 등록 시작 — 비밀키를 만들어 QR로 내려보낸다.
//
// 파일 맨 위에 `'use server'`가 붙어 있었다. 그 지시어는 모듈의 export를 **서버 액션**으로
// 등록하는 것이라 라우트 핸들러와는 층이 다르다. POST가 HTTP 엔드포인트이면서 동시에
// 액션 ID로도 불릴 수 있는 상태가 되고, Next 버전이 오르면 빌드가 깨질 자리다.

export async function POST() {
  const session = await requireApiSession();
  if ('response' in session) return session.response;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true, twoFactorEnabled: true },
  });
  if (!user?.email) return NextResponse.json({ error: '계정 정보를 찾지 못했습니다.' }, { status: 400 });
  if (user.twoFactorEnabled) {
    return NextResponse.json({ error: '이미 인증 앱이 등록되어 있습니다. 먼저 해제해 주세요.' }, { status: 409 });
  }

  const secret = authenticator.generateSecret();
  const otpauth = authenticator.keyuri(user.email, 'debateCode', secret);

  // QR은 여기서 만들어 data: URL로 내려보낸다.
  //
  // 예전에는 화면에서 api.qrserver.com에 otpauth URL을 붙여 <img src>로 불렀다.
  // 그 URL에는 **TOTP 비밀키가 그대로 들어 있다** — 즉 2단계 인증의 씨앗을 매번
  // 외부 서비스에 넘기고 있었던 셈이고, 그쪽 로그에 남으면 2단계 인증의 의미가 없어진다.
  // 그 서비스가 죽으면 QR이 안 보이는 문제도 함께 사라진다.
  const qrDataUrl = await QRCode.toDataURL(otpauth, { width: 200, margin: 1 });

  await prisma.user.update({
    where: { id: session.userId },
    data: { twoFactorTempSecret: await encryptSecret(secret) },
  });

  // secret은 QR을 못 찍는 이용자가 손으로 입력할 수 있게 함께 준다(otpauth 안에도 있다).
  return NextResponse.json({ otpauth, qrDataUrl, secret }, { headers: { 'Cache-Control': 'no-store' } });
}
