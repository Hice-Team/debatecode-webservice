// SMTP 클라이언트 — 외부 발송 서비스 없이 우리 메일 계정으로 직접 보낸다.
//
// 왜 직접 구현했나:
//   · nodemailer는 Cloudflare Workers에서 동작하지 않는다(Node 스트림·DNS 의존).
//   · Resend 같은 API 서비스는 보내는 주소의 **도메인 소유 확인**을 요구한다.
//     발신 주소가 gmail.com이면 확인할 도메인이 없어서 애초에 등록이 안 된다.
//   · Workers는 fetch 말고 TCP도 열 수 있다. node:tls의 connect가 nodejs_compat로
//     제공되므로, SMTP 대화를 직접 하면 Gmail 계정을 그대로 발신자로 쓸 수 있다.
//
// TLS는 **암묵적 TLS(465)** 만 쓴다. 587 + STARTTLS는 평문으로 붙었다가 기존 소켓을
// TLS로 승격하는데, 그 승격 경로가 런타임마다 지원이 갈린다. 465는 처음부터 TLS라
// 승격 자체가 없다 — 로컬 Node와 workerd에서 같은 코드가 같게 동작한다.
//
// env: SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / EMAIL_FROM (app/lib/email.ts 참고)
import { connect as tlsConnect, type TLSSocket } from 'node:tls';

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  /** EHLO에 쓸 이름. 서버가 검증하지는 않지만 아무 값이나 보내면 감점 요인이 된다. */
  ehloName: string;
}

export interface SmtpMessage {
  /** "이름 <주소>" 또는 "주소" */
  from: string;
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
  unsubscribeUrl?: string;
}

/** 한 통이 끝날 때까지 기다리는 최대 시간. Gmail이 조용히 붙잡고 있는 경우를 끊는다. */
const TIMEOUT_MS = 20_000;

/* ---------- 인코딩 ---------- */

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64Utf8(text: string): string {
  return base64(new TextEncoder().encode(text));
}

/** 헤더 값에 개행을 넣어 헤더를 위조하는 공격(헤더 인젝션)을 막는다. */
function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

/**
 * 한글 제목을 RFC 2047 encoded-word로 바꾼다.
 *
 * 인코딩된 한 토막은 75자를 넘으면 안 된다. 넘기면 일부 클라이언트가 제목을 통째로
 * 깨뜨려 버린다. 그래서 원문을 UTF-8 30바이트 단위로 잘라 여러 토막으로 나눈다 —
 * 글자 중간에서 자르면 안 되므로 코드포인트 단위로 센다.
 */
function encodeHeaderValue(value: string): string {
  const clean = sanitizeHeader(value);
  if (!/[^\x00-\x7F]/.test(clean)) return clean;

  const encoder = new TextEncoder();
  const words: string[] = [];
  let current = '';
  let currentBytes = 0;

  for (const char of clean) {
    const size = encoder.encode(char).length;
    if (currentBytes + size > 30) {
      words.push(`=?UTF-8?B?${base64Utf8(current)}?=`);
      current = '';
      currentBytes = 0;
    }
    current += char;
    currentBytes += size;
  }
  if (current) words.push(`=?UTF-8?B?${base64Utf8(current)}?=`);
  // 이어지는 토막은 접힘(folding) — 앞의 공백이 "한 헤더의 연속"임을 뜻한다
  return words.join('\r\n ');
}

/** "이름 <a@b.c>"에서 봉투(envelope)에 쓸 주소만 꺼낸다. */
export function bareAddress(address: string): string {
  const match = /<([^>]+)>/.exec(address);
  return sanitizeHeader(match ? match[1] : address);
}

/** base64 본문을 76자로 접는다 — 접지 않으면 긴 줄을 거부하는 서버가 있다. */
function fold(text: string): string {
  return (text.match(/.{1,76}/g) ?? []).join('\r\n');
}

/**
 * 메일 원문(MIME)을 만든다.
 *
 * 본문을 base64로 보내는 이유가 하나 더 있다: SMTP는 `.` 한 글자만 있는 줄을 본문의 끝으로
 * 읽는다. base64 알파벳에는 `.`이 없어서 그 사고가 원천적으로 일어나지 않는다.
 */
export function buildMime(message: SmtpMessage): string {
  const fromAddress = bareAddress(message.from);
  const domain = fromAddress.split('@')[1] || 'localhost';
  const headers = [
    `From: ${sanitizeHeader(message.from)}`,
    `To: ${sanitizeHeader(message.to)}`,
    message.replyTo ? `Reply-To: ${sanitizeHeader(message.replyTo)}` : null,
    `Subject: ${encodeHeaderValue(message.subject)}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    // 수신거부를 헤더로도 알린다 — 메일 클라이언트가 버튼으로 띄워 주고,
    // 그 버튼이 있으면 사람들이 스팸 신고 대신 해지를 누른다(= 도메인 평판 보호).
    message.unsubscribeUrl ? `List-Unsubscribe: <${message.unsubscribeUrl}>` : null,
    message.unsubscribeUrl ? 'List-Unsubscribe-Post: List-Unsubscribe=One-Click' : null,
  ]
    .filter(Boolean)
    .join('\r\n');

  return `${headers}\r\n\r\n${fold(base64Utf8(message.html))}`;
}

/* ---------- 연결 ---------- */

interface SmtpResponse {
  code: number;
  text: string;
}

export class SmtpError extends Error {
  /** 서버가 준 응답 코드. 연결 단계 실패면 0. */
  readonly code: number;

  constructor(message: string, code = 0) {
    super(message);
    this.name = 'SmtpError';
    this.code = code;
  }
}

/**
 * SMTP 대화 한 세션.
 *
 * 응답은 여러 줄로 온다("250-STARTTLS" … "250 SMTPUTF8"). 코드 뒤가 공백인 줄이
 * 마지막이라는 규칙만 지키면 되므로, 버퍼에 그 줄이 들어올 때까지 기다렸다가 한 번에 돌려준다.
 */
class SmtpSession {
  private buffer = '';
  private pending: { resolve: (r: SmtpResponse) => void; reject: (e: Error) => void } | null = null;
  private failure: Error | null = null;

  private readonly socket: TLSSocket;

  private constructor(socket: TLSSocket) {
    this.socket = socket;
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      this.buffer += chunk;
      this.drain();
    });
    socket.on('error', (error: Error) => this.abort(new SmtpError(`연결 오류: ${error.message}`)));
    socket.on('close', () => this.abort(new SmtpError('서버가 연결을 닫았습니다.')));
    socket.on('timeout', () => {
      socket.destroy();
      this.abort(new SmtpError('응답이 없어 연결을 끊었습니다.'));
    });
  }

  static open(config: SmtpConfig): Promise<SmtpSession> {
    return new Promise((resolve, reject) => {
      const socket = tlsConnect(
        { host: config.host, port: config.port, servername: config.host },
        () => {
          socket.setTimeout(TIMEOUT_MS);
          resolve(new SmtpSession(socket));
        },
      );
      socket.setTimeout(TIMEOUT_MS);
      socket.once('error', (error: Error) =>
        reject(new SmtpError(`${config.host}:${config.port} 접속 실패 — ${error.message}`)),
      );
    });
  }

  private abort(error: Error) {
    this.failure ??= error;
    const waiter = this.pending;
    this.pending = null;
    waiter?.reject(error);
  }

  private drain() {
    if (!this.pending) return;
    const lines = this.buffer.split('\r\n');
    // 마지막 조각은 아직 개행이 오지 않은 미완성 줄이므로 건드리지 않는다
    for (let i = 0; i < lines.length - 1; i += 1) {
      if (!/^\d{3} /.test(lines[i])) continue;
      const consumed = lines.slice(0, i + 1);
      this.buffer = lines.slice(i + 1).join('\r\n');
      const waiter = this.pending;
      this.pending = null;
      waiter?.resolve({ code: Number(lines[i].slice(0, 3)), text: consumed.join(' ') });
      return;
    }
  }

  private read(): Promise<SmtpResponse> {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.drain();
    });
  }

  /** 명령을 보내고 응답 코드를 확인한다. 기대와 다르면 서버가 준 문장을 그대로 올린다. */
  async command(line: string, expected: number[], redact = false): Promise<SmtpResponse> {
    if (this.failure) throw this.failure;
    this.socket.write(`${line}\r\n`);
    const response = await this.read();
    if (!expected.includes(response.code)) {
      // 비밀번호를 주고받는 단계에서는 보낸 내용을 로그에 남기지 않는다
      throw new SmtpError(`${redact ? '인증' : line.split(' ')[0]} 실패 — ${response.text}`, response.code);
    }
    return response;
  }

  async greeting(): Promise<void> {
    const response = await this.read();
    if (response.code !== 220) throw new SmtpError(`서버 인사말이 이상합니다 — ${response.text}`, response.code);
  }

  async authenticate(user: string, pass: string): Promise<void> {
    await this.command('AUTH LOGIN', [334], true);
    await this.command(base64Utf8(user), [334], true);
    await this.command(base64Utf8(pass), [235], true);
  }

  /** 한 통 발송. 실패해도 세션은 살아 있어야 다음 통을 보낼 수 있다. */
  async send(message: SmtpMessage): Promise<void> {
    await this.command(`MAIL FROM:<${bareAddress(message.from)}>`, [250]);
    await this.command(`RCPT TO:<${bareAddress(message.to)}>`, [250, 251]);
    await this.command('DATA', [354]);
    this.socket.write(`${buildMime(message)}\r\n.\r\n`);
    const response = await this.read();
    if (response.code !== 250) throw new SmtpError(`발송 거부 — ${response.text}`, response.code);
  }

  /** 실패한 트랜잭션을 정리한다. 이걸 안 하면 다음 MAIL FROM이 "순서 오류"로 거절된다. */
  async reset(): Promise<void> {
    await this.command('RSET', [250]).catch(() => null);
  }

  async close(): Promise<void> {
    await this.command('QUIT', [221]).catch(() => null);
    this.socket.end();
    this.socket.destroy();
  }
}

export interface SmtpSendReport {
  sent: number;
  failed: number;
  /** 첫 실패 사유 — 화면에 그대로 보여 준다. 전부 같은 이유로 실패하는 경우가 대부분이다. */
  error?: string;
}

/**
 * 여러 통을 **한 연결로** 보낸다.
 *
 * 통마다 새로 접속하면 Gmail이 짧은 시간의 반복 로그인을 의심스러운 접근으로 보고 막는다.
 * 한 통이 거절돼도(주소 오타 등) RSET으로 정리하고 다음 통을 계속 보낸다 —
 * 주소 하나 때문에 홍보 메일 전체가 멈추면 안 된다.
 */
export async function smtpSend(config: SmtpConfig, messages: SmtpMessage[]): Promise<SmtpSendReport> {
  if (messages.length === 0) return { sent: 0, failed: 0 };

  let session: SmtpSession;
  try {
    session = await SmtpSession.open(config);
    await session.greeting();
    await session.command(`EHLO ${config.ehloName}`, [250]);
    await session.authenticate(config.user, config.pass);
  } catch (error) {
    // 접속·인증 실패는 전부 실패다. 개별 재시도로 풀릴 문제가 아니다.
    return {
      sent: 0,
      failed: messages.length,
      error: error instanceof Error ? error.message : '메일 서버에 연결하지 못했습니다.',
    };
  }

  let sent = 0;
  let failed = 0;
  let firstError: string | undefined;

  for (const message of messages) {
    try {
      await session.send(message);
      sent += 1;
    } catch (error) {
      failed += 1;
      firstError ??= error instanceof Error ? error.message : '발송에 실패했습니다.';
      // 연결 자체가 죽었으면 남은 통은 시도할 필요가 없다
      if (error instanceof SmtpError && error.code === 0) {
        failed += messages.length - sent - failed;
        break;
      }
      await session.reset();
    }
  }

  await session.close();
  return { sent, failed, error: firstError };
}
