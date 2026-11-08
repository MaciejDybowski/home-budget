import { tr } from "../i18n";
import type { Expense } from "./store";

export function expenseTitle(expense: Expense): string {
  const category = expense.category.name.trim().toLocaleLowerCase("pl");
  const description = expense.description?.trim();
  const merchant = expense.merchant?.trim();
  if (description && description.toLocaleLowerCase("pl") !== category)
    return description;
  if (merchant && merchant.toLocaleLowerCase("pl") !== category)
    return merchant;
  return tr("Wydatek bez opisu");
}
