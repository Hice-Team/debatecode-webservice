// 메일 발송 — 우리 메일 계정에서 SMTP로 직접 보낸다.
//
// 전송 수단은 두 가지를 지원하고, 설정된 쪽을 자동으로 고른다.
//
//   1) SMTP (기본)  SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS
//      우리가 가진 메일 계정을 그대로 발신자로 쓴다. 외부 서비스에 가입할 필요도,
//      도메인 소유를 증명할 필요도 없다.
//   2) Resend       RESEND_API_KEY
//      나중에 자체 도메인(debatecode.kr)으로 옮길 때를 위해 남겨 둔 경로다.
//      SMTP 설정이 있으면 이쪽은 쓰지 않는다.
//
// 둘 다 없으면 실제로 보내지 않고 "보냈다면 이랬을 것"을 돌려준다(dryRun). 개발 중에 콘솔의
// 발송 화면이 통째로 막히면 흐름을 확인할 수 없기 때문이다. 대신 결과에 dryRun을 표시해
// 화면이 "실제 발송됨"으로 착각하지 않게 한다.
import { smtpSend, type SmtpConfig } from './smtp';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'debateCode <hicecorp.team@gmail.com>';

/**
 * 한 번에 처리할 수신자 수.
 *
 * SMTP에서는 한 연결에서 연속으로 보낼 수 있는 통수에 서버마다 제한이 있다(Gmail은 약 100).
 * 그보다 넉넉히 낮게 잡아 연결을 나눈다.
 */
const BATCH_SIZE = 50;

export interface SendResult {
  sent: number;
  failed: number;
  /** 전송 수단이 설정되지 않아 실제로는 보내지 않은 경우 */
  dryRun: boolean;
  error?: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  /** 수신거부 링크 — 헤더에도 넣어 메일 클라이언트가 버튼으로 띄우게 한다 */
  unsubscribeUrl?: string;
}

/* ---------- 전송 수단 선택 ---------- */

type Transport =
  | { kind: 'smtp'; config: SmtpConfig }
  | { kind: 'resend'; key: string }
  | { kind: 'none' };

export function fromAddress(): string {
  return process.env.EMAIL_FROM || DEFAULT_FROM;
}

function transport(): Transport {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (host && user && pass) {
    return {
      kind: 'smtp',
      config: {
        host,
        // 465(암묵적 TLS)만 지원한다 — 이유는 app/lib/smtp.ts 머리말 참고
        port: Number(process.env.SMTP_PORT) || 465,
        user,
        pass,
        ehloName: process.env.SMTP_EHLO_NAME || hostnameOfSite(),
      },
    };
  }
  const key = process.env.RESEND_API_KEY;
  if (key) return { kind: 'resend', key };
  return { kind: 'none' };
}

function hostnameOfSite(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://debatecode.kr').hostname;
  } catch {
    return 'debatecode.kr';
  }
}

export function isEmailLive(): boolean {
  return transport().kind !== 'none';
}

/** 콘솔·헬스체크에 그대로 띄우는 한 줄 설명 */
export function emailTransportLabel(): string {
  const active = transport();
  if (active.kind === 'smtp') return `SMTP ${active.config.host}:${active.config.port} · 발신 ${fromAddress()}`;
  if (active.kind === 'resend') return `Resend · 발신 ${fromAddress()}`;
  return '전송 수단 미설정 — 발송은 dry-run으로 기록만 남는다';
}

/* ---------- 발송 ---------- */

async function sendViaResend(message: MailMessage, key: string): Promise<boolean> {
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [message.to],
        subject: message.subject,
        html: message.html,
        ...(message.unsubscribeUrl
          ? {
              headers: {
                'List-Unsubscribe': `<${message.unsubscribeUrl}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
              },
            }
          : {}),
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 여러 통을 보낸다. 한 통이 실패해도 나머지는 계속 보낸다 —
 * 주소 하나가 잘못됐다고 발송 전체가 멈추면 안 된다.
 */
export async function sendBulk(messages: MailMessage[]): Promise<SendResult> {
  const active = transport();
  if (active.kind === 'none') return { sent: 0, failed: 0, dryRun: true };

  const from = fromAddress();
  let sent = 0;
  let failed = 0;
  let error: string | undefined;

  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);

    if (active.kind === 'smtp') {
      const report = await smtpSend(
        active.config,
        batch.map((m) => ({
          from,
          to: m.to,
          subject: m.subject,
          html: m.html,
          replyTo: process.env.EMAIL_REPLY_TO || undefined,
          unsubscribeUrl: m.unsubscribeUrl,
        })),
      );
      sent += report.sent;
      failed += report.failed;
      error ??= report.error;
      continue;
    }

    const results = await Promise.all(batch.map((m) => sendViaResend(m, active.key)));
    for (const ok of results) {
      if (ok) sent += 1;
      else failed += 1;
    }
    if (failed > 0) error ??= 'Resend가 발송을 거부했습니다.';
  }

  return { sent, failed, dryRun: false, error };
}

export async function sendMail(message: MailMessage): Promise<SendResult> {
  return sendBulk([message]);
}


// ---------- 본문 틀 ----------

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 아주 작은 마크다운 → HTML.
 *
 * 운영자가 쓰는 홍보 메일에 필요한 것만 다룬다(제목·굵게·링크·목록·문단).
 * 이용자 입력이 아니라 운영자 입력이지만, 콘솔 계정이 털렸을 때 임의 HTML이 그대로 나가지
 * 않도록 먼저 이스케이프한 뒤 허용한 문법만 되살린다.
 */
export function renderMarkdown(md: string): string {
  const lines = escapeHtml(md).split(/\r?\n/);
  const out: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      out.push('</ul>');
      inList = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      closeList();
      continue;
    }
    if (/^###\s+/.test(line)) {
      closeList();
      out.push(`<h3 style="margin:24px 0 8px;font-size:16px;">${line.replace(/^###\s+/, '')}</h3>`);
    } else if (/^##\s+/.test(line)) {
      closeList();
      out.push(`<h2 style="margin:28px 0 10px;font-size:20px;">${line.replace(/^##\s+/, '')}</h2>`);
    } else if (/^#\s+/.test(line)) {
      closeList();
      out.push(`<h1 style="margin:0 0 12px;font-size:24px;">${line.replace(/^#\s+/, '')}</h1>`);
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        out.push('<ul style="margin:8px 0;padding-left:20px;">');
        inList = true;
      }
      out.push(`<li style="margin:4px 0;">${inline(line.replace(/^[-*]\s+/, ''))}</li>`);
    } else {
      closeList();
      out.push(`<p style="margin:10px 0;line-height:1.7;">${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join('\n');
}

function inline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // 링크는 http/https만 되살린다 — javascript: 등 다른 스킴은 글자로 남는다
    .replace(/\[(.+?)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" style="color:#1800AC;">$1</a>');
}

/** 홍보 메일 공통 껍데기 — 머리글·본문·수신거부 안내 */
export function campaignHtml({
  subject,
  bodyMarkdown,
  unsubscribeUrl,
}: {
  subject: string;
  bodyMarkdown: string;
  unsubscribeUrl: string;
}): string {
  return `<!doctype html>
<html lang="ko"><body style="margin:0;background:#f6f6f7;padding:24px 12px;font-family:'Apple SD Gothic Neo',Pretendard,system-ui,sans-serif;color:#1c1c1e;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e6e6e9;border-radius:14px;overflow:hidden;">
    <div style="padding:20px 28px;border-bottom:1px solid #eeeef1;">
      <span style="font-size:13px;font-weight:700;letter-spacing:.12em;color:#1800AC;">DEBATECODE</span>
    </div>
    <div style="padding:24px 28px;font-size:15px;">
      ${renderMarkdown(bodyMarkdown)}
    </div>
    <div style="padding:18px 28px;border-top:1px solid #eeeef1;background:#fafafb;font-size:12px;color:#8a8a8f;line-height:1.6;">
      <p style="margin:0 0 6px;">이 메일은 광고성 정보 수신에 동의하신 분께 발송되었습니다. (제목: ${escapeHtml(subject)})</p>
      <p style="margin:0;"><a href="${unsubscribeUrl}" style="color:#8a8a8f;">수신거부</a></p>
    </div>
  </div>
</body></html>`;
}
