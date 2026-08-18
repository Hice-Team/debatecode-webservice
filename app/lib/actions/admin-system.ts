'use server';

// 시스템 운영 액션 — 런타임 설정, 유지보수 모드, 매크로.
//
// 여기서 바꾸는 값은 재배포 없이 즉시 서비스 동작을 바꾼다. 그만큼 되돌릴 근거가
// 남아야 해서, 모든 변경에 감사 로그를 붙이고 전/후 값을 함께 기록한다.
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { getUser } from '../dal';
import { prisma } from '../prisma';
import { requirePermission } from '../permissions-server';
import { audit } from '../audit';
import { SETTING_DEFS, settingDef, type SettingDef } from '../settings';
import { sendMail, isEmailLive, emailTransportLabel } from '../email';

/* ---------- 런타임 설정 ---------- */

/** 폼에서 온 문자열을 정의된 타입으로 변환. 범위를 벗어나면 잘라 낸다. */
function coerce(def: SettingDef, raw: string): boolean | number | string {
  switch (def.valueType) {
    case 'boolean':
      return raw === 'true' || raw === 'on' || raw === '1';
    case 'number': {
      const n = Number(raw);
      if (!Number.isFinite(n)) throw new Error(`${def.label}: 숫자를 입력하세요.`);
      const clamped = Math.min(def.max ?? Infinity, Math.max(def.min ?? -Infinity, Math.round(n)));
      return clamped;
    }
    case 'enum': {
      const ok = def.options?.some((o) => o.value === raw);
      if (!ok) throw new Error(`${def.label}: 알 수 없는 값입니다.`);
      return raw;
    }
    default:
      return raw.slice(0, 2000);
  }
}

export interface SettingFormState {
  saved?: string; // 저장된 설정 라벨
  error?: string;
}

/**
 * 설정 값 하나 변경. 기본값과 같아지면 행을 지운다 —
 * AppSetting 표에는 "기본값에서 벗어난 것"만 남아 있어야 무엇을 손댔는지 한눈에 보인다.
 */
export async function updateSetting(
  _prev: SettingFormState,
  formData: FormData,
): Promise<SettingFormState> {
  const caller = await getUser();
  await requirePermission(caller, 'setting.write');

  const key = String(formData.get('key') ?? '');
  const def = settingDef(key);
  if (!def) return { error: '알 수 없는 설정입니다.' };

  // 유지보수 모드는 별도 권한 — 전체 서비스를 내리는 스위치라 설정 변경 권한과 분리한다
  if (def.category === 'maintenance') {
    await requirePermission(caller, 'maintenance.toggle');
  }

  let value: boolean | number | string;
  try {
    value = coerce(def, String(formData.get('value') ?? ''));
  } catch (error) {
    return { error: error instanceof Error ? error.message : '값이 올바르지 않습니다.' };
  }

  const existing = await prisma.appSetting.findUnique({ where: { key }, select: { value: true } });
  const before = existing ? existing.value : def.default;
  if (before === value) return { saved: def.label }; // 바뀐 게 없으면 이력을 더럽히지 않는다

  if (value === def.default) {
    await prisma.appSetting.delete({ where: { key } }).catch(() => {});
  } else {
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value: value as never, category: def.category, updatedById: caller.id },
      update: { value: value as never, updatedById: caller.id },
    });
  }

  const isMaintenanceToggle = key === 'maintenance.enabled';
  await audit({
    actor: caller,
    action: isMaintenanceToggle ? (value ? 'maintenance.on' : 'maintenance.off') : 'setting.update',
    targetType: 'setting',
    targetId: key,
    summary: `${def.label}: ${format(before)} → ${format(value)}`,
    diff: { before, after: value },
  });

  revalidatePath('/console/system', 'layout');
  revalidatePath('/', 'layout'); // 배너·점검 화면이 즉시 반영되도록
  return { saved: def.label };
}

function format(value: unknown): string {
  if (typeof value === 'boolean') return value ? '켬' : '끔';
  if (value === '' || value == null) return '(비움)';
  return String(value).slice(0, 80);
}

/** 카테고리 전체를 코드 기본값으로 되돌린다 — 잘못 만진 설정을 한 번에 원복. */
export async function resetSettingCategory(formData: FormData) {
  const caller = await getUser();
  await requirePermission(caller, 'setting.write');

  const category = String(formData.get('category') ?? '');
  const keys = SETTING_DEFS.filter((d) => d.category === category).map((d) => d.key);
  if (keys.length === 0) return;
  if (category === 'maintenance') await requirePermission(caller, 'maintenance.toggle');

  const removed = await prisma.appSetting.findMany({
    where: { key: { in: keys } },
    select: { key: true, value: true },
  });
  if (removed.length === 0) return;

  await prisma.appSetting.deleteMany({ where: { key: { in: keys } } });
  await audit({
    actor: caller,
    action: 'setting.reset',
    targetType: 'setting',
    targetId: category,
    summary: `${category} 설정 ${removed.length}건을 기본값으로 되돌림`,
    diff: { before: Object.fromEntries(removed.map((r) => [r.key, r.value])) },
  });

  revalidatePath('/console/system', 'layout');
  revalidatePath('/', 'layout');
}

/* ---------- 유지보수 모드 ---------- */

const maintenanceSchema = z.object({
  enabled: z.boolean(),
  message: z.string().trim().max(2000),
  eta: z.string().trim().max(120),
});

export interface MaintenanceFormState {
  saved?: boolean;
  error?: string;
}

/**
 * 유지보수 모드 일괄 적용 — 켜기와 안내 문구를 한 번에.
 * 문구를 빈 채로 켜 놓고 나중에 채우는 상황을 막으려고 한 폼으로 묶었다.
 */
export async function saveMaintenance(
  _prev: MaintenanceFormState,
  formData: FormData,
): Promise<MaintenanceFormState> {
  const caller = await getUser();
  await requirePermission(caller, 'maintenance.toggle');

  const parsed = maintenanceSchema.safeParse({
    enabled: formData.get('enabled') === 'on' || formData.get('enabled') === 'true',
    message: String(formData.get('message') ?? ''),
    eta: String(formData.get('eta') ?? ''),
  });
  if (!parsed.success) return { error: '입력값을 확인해 주세요.' };

  const { enabled, message, eta } = parsed.data;
  if (enabled && !message) return { error: '점검 안내 문구는 비워 둘 수 없습니다.' };

  const before = await prisma.appSetting.findUnique({
    where: { key: 'maintenance.enabled' },
    select: { value: true },
  });
  const wasEnabled = before?.value === true;

  const write = async (key: string, value: boolean | string, fallback: boolean | string) => {
    if (value === fallback) {
      await prisma.appSetting.delete({ where: { key } }).catch(() => {});
      return;
    }
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value: value as never, category: 'maintenance', updatedById: caller.id },
      update: { value: value as never, updatedById: caller.id },
    });
  };

  const defaults = Object.fromEntries(SETTING_DEFS.map((d) => [d.key, d.default]));
  await Promise.all([
    write('maintenance.enabled', enabled, defaults['maintenance.enabled'] as boolean),
    write('maintenance.message', message, defaults['maintenance.message'] as string),
    write('maintenance.eta', eta, defaults['maintenance.eta'] as string),
  ]);

  if (wasEnabled !== enabled) {
    await audit({
      actor: caller,
      action: enabled ? 'maintenance.on' : 'maintenance.off',
      targetType: 'setting',
      targetId: 'maintenance',
      summary: enabled ? `유지보수 모드 시작 — ${message.slice(0, 60)}` : '유지보수 모드 해제',
      diff: { before: wasEnabled, after: enabled },
    });
  }

  revalidatePath('/console/system', 'layout');
  revalidatePath('/', 'layout');
  return { saved: true };
}

/* ---------- 테스트 메일 ---------- */

export interface TestMailState {
  ok?: string;
  error?: string;
}

/**
 * 지금 설정된 전송 수단으로 실제 한 통을 보낸다.
 *
 * "키가 꽂혀 있는가"는 헬스체크가 알려 주지만, 그것과 "실제로 도착하는가"는 다른 문제다.
 * 앱 비밀번호가 만료됐거나, 발신 주소가 계정과 달라 거절당하거나, 스팸함으로 직행하는
 * 상황은 전부 헬스체크가 초록불인 채로 벌어진다. 배포 직후 이 버튼 한 번이 그걸 잡는다.
 */
export async function sendTestMail(_prev: TestMailState, formData: FormData): Promise<TestMailState> {
  const caller = await getUser();
  await requirePermission(caller, 'setting.write');

  const to = String(formData.get('to') ?? '').trim() || caller.email;
  if (!to || !to.includes('@')) return { error: '받는 주소를 입력해 주세요.' };

  if (!isEmailLive()) {
    return { error: '전송 수단이 설정되지 않았습니다(SMTP_HOST · SMTP_USER · SMTP_PASS).' };
  }

  const result = await sendMail({
    to,
    subject: '[debateCode] 메일 발송 테스트',
    html: `
      <div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.7;color:#1a1d23;max-width:480px">
        <h2 style="font-size:18px;margin:0 0 8px">메일 발송이 정상입니다</h2>
        <p style="margin:0 0 16px;font-size:14px;color:#4b5563">
          콘솔 › 시스템 › 상태에서 보낸 테스트 메일입니다. 이 메일이 도착했다면 문의 답변·인증 코드·홍보 메일이
          모두 같은 경로로 나갑니다.
        </p>
        <p style="margin:0;font-size:12px;color:#6b7280">
          전송 수단: ${emailTransportLabel()}<br />보낸 사람: ${caller.name ?? caller.email}
        </p>
      </div>`,
  }).catch((error: unknown) => ({
    sent: 0,
    failed: 1,
    dryRun: false,
    error: error instanceof Error ? error.message : '발송에 실패했습니다.',
  }));

  await audit({
    actor: caller,
    action: 'system.test_mail',
    targetType: 'setting',
    targetId: 'email',
    summary: `테스트 메일 → ${to} (${result.sent > 0 ? '성공' : `실패: ${result.error ?? '원인 미상'}`})`,
  });

  if (result.sent > 0) return { ok: `${to}(으)로 보냈습니다. 받은편지함과 스팸함을 모두 확인하세요.` };
  return { error: result.error ?? '발송에 실패했습니다.' };
}
