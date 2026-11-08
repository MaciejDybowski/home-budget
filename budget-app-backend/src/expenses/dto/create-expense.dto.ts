export class CreateExpenseDto {
  amount: number
  description?: string
  date: Date
  categoryId: string
}
