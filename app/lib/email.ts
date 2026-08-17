// 메일 발송 — Resend REST API를 직접 부른다(SDK 의존성 없이).
//
// 키가 없는 환경에서는 실제로 보내지 않고 "보냈다면 이랬을 것"을 돌려준다. 개발 중에 콘솔의
// 발송 화면이 통째로 막히면 흐름을 확인할 수 없기 때문이다. 대신 결과에 dryRun을 표시해
// 화면이 "실제 발송됨"으로 착각하지 않게 한다.
//
// env:
//   RESEND_API_KEY   발송 키 (없으면 dry-run)
//   EMAIL_FROM       보내는 주소 (예: "debateCode <noreply@debatecode.kr>")

const RESEND_ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'debateCode <noreply@debatecode.kr>';

/** 한 번에 보낼 수 있는 수신자 수 — 그 이상은 나눠 보낸다 */
const BATCH_SIZE = 50;

export interface SendResult {
  sent: number;
  failed: number;
  /** 키가 없어 실제로는 보내지 않은 경우 */
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

function apiKey(): string | undefined {
  return process.env.RESEND_API_KEY;
}

export function isEmailLive(): boolean {
  return !!apiKey();
}

async function sendOne(message: MailMessage, key: string): Promise<boolean> {
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        // 수신거부는 본문 링크만이 아니라 헤더로도 알린다 — 스팸 신고 대신 해지로 이어진다
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
  const key = apiKey();
  if (!key) return { sent: 0, failed: 0, dryRun: true };

  let sent = 0;
  let failed = 0;
  for (let i = 0; i < messages.length; i += BATCH_SIZE) {
    const batch = messages.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map((m) => sendOne(m, key)));
    for (const ok of results) {
      if (ok) sent += 1;
      else failed += 1;
    }
  }
  return { sent, failed, dryRun: false };
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
