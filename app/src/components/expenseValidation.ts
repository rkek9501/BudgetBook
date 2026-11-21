import { MESSAGES } from '@/domain/messages';
import { parseAmount } from '@/domain/money';

export interface FieldErrors { description?: string; amount?: string; category?: string }

export type ExpenseFields =
  | { ok: true; description: string; amount: number; categoryId: number }
  | { ok: false; errors: FieldErrors };

export function validateExpenseFields(
  description: string,
  amountText: string,
  categoryId: number | null,
  editing = false,
): ExpenseFields {
  const errors: FieldErrors = {};
  const desc = description.trim();
  if (desc === '') errors.description = MESSAGES.descriptionRequired;
  const parsed = parseAmount(amountText);
  if (!parsed.ok) {
    if (parsed.error === 'too-large') errors.amount = MESSAGES.amountTooLarge;
    else if (parsed.error === 'negative') errors.amount = MESSAGES.amountNegative;
    else errors.amount = editing ? MESSAGES.amountInvalidForEdit : MESSAGES.amountInvalid;
  }
  if (categoryId === null) errors.category = MESSAGES.categoryRequired;
  if (errors.description || errors.amount || errors.category || !parsed.ok || categoryId === null) {
    return { ok: false, errors };
  }
  return { ok: true, description: desc, amount: parsed.value, categoryId };
}
