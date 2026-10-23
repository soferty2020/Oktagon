'use server';

import { revalidatePath } from 'next/cache';

import { apiFetch, describeError, type ApiFailure } from '@/lib/api/client';
import { getCurrentUser, readTokens } from '@/lib/server/session';

export interface DebtRulesFormState {
  error?: string;
  success?: string;
  preview?: {
    debtorsBefore: number;
    debtorsAfter: number;
    debtBefore: number | null;
    debtAfter: number | null;
    changed: Array<{
      athleteId: string;
      name: string;
      wasDebtor: boolean;
      willBeDebtor: boolean;
      outstanding: number | null;
    }>;
  };
}

/** Настройки из формы: разбор общий для preview и сохранения. */
function readConfig(formData: FormData) {
  const toleranceKind = String(formData.get('toleranceKind') ?? 'NONE');
  const amount = Number(formData.get('toleranceAmount') ?? 0);
  const percent = Number(formData.get('tolerancePercent') ?? 0);

  return {
    useFullyPaidMark: formData.get('useFullyPaidMark') === 'on',
    noTrainingPolicy: String(formData.get('noTrainingPolicy') ?? 'EXEMPT'),
    freezePolicy: String(formData.get('freezePolicy') ?? 'EXEMPT_MONTH'),
    expectedMissing: String(formData.get('expectedMissing') ?? 'DEBTOR'),
    partialTolerance:
      toleranceKind === 'FIXED'
        ? { kind: 'FIXED', amount: Number.isFinite(amount) ? amount : 0 }
        : toleranceKind === 'PERCENT'
          ? { kind: 'PERCENT', percent: Number.isFinite(percent) ? percent : 0 }
          : { kind: 'NONE' },
  };
}

async function withSession<T>(
  action: (accessToken: string) => Promise<{ ok: true; data: T } | { ok: false; error: ApiFailure }>,
): Promise<{ data?: T; error?: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { error: 'Сессия истекла, войдите заново' };
  }

  const { accessToken } = await readTokens();
  if (!accessToken) {
    return { error: 'Сессия истекла, войдите заново' };
  }

  const result = await action(accessToken);
  if (!result.ok) {
    return { error: describeError(result.error) };
  }
  return { data: result.data };
}

/**
 * Предпросмотр правила (K5, ADR-0014).
 *
 * Обязательный шаг перед сохранением: правило меняет финансовую картину месяца,
 * и администратор должен видеть, кто станет должником и кто перестанет.
 */
export async function previewDebtRulesAction(
  _prev: DebtRulesFormState,
  formData: FormData,
): Promise<DebtRulesFormState> {
  const month = String(formData.get('effectiveFrom') ?? '').trim();

  const result = await withSession((accessToken) =>
    apiFetch<{
      debtorsBefore: number;
      debtorsAfter: number;
      debtBefore: number | null;
      debtAfter: number | null;
      changed: Array<{
        athleteId: string;
        name: string;
        wasDebtor: boolean;
        willBeDebtor: boolean;
        outstanding: number | null;
      }>;
    }>(`/finance/debt-rules/preview?month=${encodeURIComponent(month)}`, {
      accessToken,
      method: 'POST',
      body: { config: readConfig(formData) },
    }),
  );

  if (result.error) {
    return { error: result.error };
  }
  return { preview: result.data };
}

/** Новая версия правил: прошлое запрещено, поэтому месяц проверяется на сервере. */
export async function saveDebtRulesAction(
  _prev: DebtRulesFormState,
  formData: FormData,
): Promise<DebtRulesFormState> {
  const effectiveFrom = String(formData.get('effectiveFrom') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();

  const result = await withSession((accessToken) =>
    apiFetch('/settings/finance/debt-rules', {
      accessToken,
      method: 'POST',
      body: {
        ...readConfig(formData),
        effectiveFrom,
        ...(note ? { note } : {}),
      },
    }),
  );

  if (result.error) {
    return { error: result.error };
  }

  revalidatePath('/settings/finance');
  return { success: 'Правило сохранено новой версией' };
}
