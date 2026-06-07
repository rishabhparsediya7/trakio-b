import { db } from "../db"
import {
  splitExpenses,
  splitExpenseParticipants,
  settlements,
  userBalances,
  users,
} from "../db/schema"
import { eq, and, or, ne, sql, desc, inArray } from "drizzle-orm"
import { sendSplitInviteEmail } from "../utils/sendMail"

interface CreateSplitExpenseParams {
  createdBy: string
  description: string
  totalAmount: number
  category?: number
  participants: { userId: string; amountOwed: number }[]
  expenseDate?: string
  paidBy: string
  groupId?: string
  splitType?: string
}

interface SettleUpParams {
  splitExpenseId: string
  payerId: string
  payeeId: string
  amount: number
  note?: string
}

class SplitExpenseService {
  /**
   * Create a new split expense
   */
  async createSplitExpense({
    createdBy,
    description,
    totalAmount,
    category,
    participants,
    expenseDate,
    paidBy,
    groupId,
    splitType,
  }: CreateSplitExpenseParams) {
    try {
      // Insert split expense
      const [newExpense] = await db
        .insert(splitExpenses)
        .values({
          createdBy,
          paidBy,
          description,
          totalAmount: String(totalAmount),
          category: category || null,
          groupId: groupId || null,
          splitType: splitType || "equal",
          expenseDate: expenseDate || new Date().toISOString(),
        })
        .returning()

      // Insert participants
      for (const participant of participants) {
        const isPayer = participant.userId === paidBy
        await db.insert(splitExpenseParticipants).values({
          splitExpenseId: newExpense.id,
          userId: participant.userId,
          amountOwed: String(participant.amountOwed),
          isPayer,
          status: isPayer ? "settled" : "pending",
        })

        // Update user balances for non-payers
        if (!isPayer) {
          await this.updateBalance(
            paidBy,
            participant.userId,
            participant.amountOwed
          )
        }
      }

      // Best-effort: email anyone who isn't on Trakio yet (placeholders).
      this.notifyPlaceholderParticipants(
        createdBy,
        description,
        participants.map((p) => p.userId)
      ).catch((e) =>
        console.log("notifyPlaceholderParticipants error (non-fatal):", e)
      )

      return {
        success: true,
        data: {
          ...newExpense,
          participants,
        },
      }
    } catch (error) {
      console.error("SplitExpenseService.createSplitExpense error:", error)
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to create split expense",
      }
    }
  }

  /**
   * Emails any participants who aren't registered yet (placeholders) to invite
   * them to Trakio. Best-effort — never throws into the create path.
   */
  private async notifyPlaceholderParticipants(
    createdBy: string,
    description: string,
    participantIds: string[]
  ) {
    if (participantIds.length === 0) return

    const placeholders = await db
      .select({ email: users.email })
      .from(users)
      .where(
        and(inArray(users.id, participantIds), eq(users.isPlaceholder, true))
      )
    if (placeholders.length === 0) return

    const [inviter] = await db
      .select({ firstName: users.firstName, lastName: users.lastName })
      .from(users)
      .where(eq(users.id, createdBy))
    const inviterName = inviter
      ? `${inviter.firstName} ${inviter.lastName}`.trim()
      : "Someone"
    const appUrl = process.env.APP_INVITE_URL || "https://trakio.app"

    await Promise.all(
      placeholders
        .filter((p) => p.email)
        .map((p) =>
          sendSplitInviteEmail({
            email: p.email as string,
            inviterName,
            description,
            appUrl,
          }).catch((e) => console.log("invite email failed:", e))
        )
    )
  }

  /**
   * Get all split expenses for a user
   */
  async getSplitExpenses(userId: string, groupId?: string) {
    try {
      // If filtering by group, return group-scoped expenses
      if (groupId) {
        const expenses = await db
          .select({
            id: splitExpenses.id,
            createdBy: splitExpenses.createdBy,
            paidBy: splitExpenses.paidBy,
            description: splitExpenses.description,
            totalAmount: splitExpenses.totalAmount,
            category: splitExpenses.category,
            groupId: splitExpenses.groupId,
            splitType: splitExpenses.splitType,
            expenseDate: splitExpenses.expenseDate,
            status: splitExpenses.status,
            createdAt: splitExpenses.createdAt,
            updatedAt: splitExpenses.updatedAt,
          })
          .from(splitExpenses)
          .where(eq(splitExpenses.groupId, groupId))
          .orderBy(desc(splitExpenses.createdAt))

        const expensesWithParticipants = await Promise.all(
          expenses.map(async (expense) => {
            const participants = await db
              .select({
                userId: splitExpenseParticipants.userId,
                amountOwed: splitExpenseParticipants.amountOwed,
                amountPaid: splitExpenseParticipants.amountPaid,
                isPayer: splitExpenseParticipants.isPayer,
                status: splitExpenseParticipants.status,
                userName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
              })
              .from(splitExpenseParticipants)
              .innerJoin(users, eq(users.id, splitExpenseParticipants.userId))
              .where(eq(splitExpenseParticipants.splitExpenseId, expense.id))

            const [creator] = await db
              .select({
                name: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
              })
              .from(users)
              .where(eq(users.id, expense.createdBy))

            return {
              ...expense,
              participants,
              creatorName: creator?.name || "",
            }
          })
        )

        return { success: true, data: expensesWithParticipants }
      }
      // Get all split expense IDs where user is creator or participant
      const participantExpenses = await db
        .select({ splitExpenseId: splitExpenseParticipants.splitExpenseId })
        .from(splitExpenseParticipants)
        .where(eq(splitExpenseParticipants.userId, userId))

      const participantExpenseIds = participantExpenses.map(
        (p) => p.splitExpenseId
      )

      // Get expenses created by user or where user is participant
      const expenses = await db
        .select({
          id: splitExpenses.id,
          createdBy: splitExpenses.createdBy,
          paidBy: splitExpenses.paidBy,
          description: splitExpenses.description,
          totalAmount: splitExpenses.totalAmount,
          category: splitExpenses.category,
          groupId: splitExpenses.groupId,
          splitType: splitExpenses.splitType,
          expenseDate: splitExpenses.expenseDate,
          status: splitExpenses.status,
          createdAt: splitExpenses.createdAt,
          updatedAt: splitExpenses.updatedAt,
        })
        .from(splitExpenses)
        .where(
          or(
            eq(splitExpenses.createdBy, userId),
            participantExpenseIds.length > 0
              ? inArray(splitExpenses.id, participantExpenseIds)
              : sql`false`
          )
        )
        .orderBy(desc(splitExpenses.createdAt))

      // Get participants for each expense
      const expensesWithParticipants = await Promise.all(
        expenses.map(async (expense) => {
          const participants = await db
            .select({
              userId: splitExpenseParticipants.userId,
              amountOwed: splitExpenseParticipants.amountOwed,
              amountPaid: splitExpenseParticipants.amountPaid,
              isPayer: splitExpenseParticipants.isPayer,
              status: splitExpenseParticipants.status,
              userName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
            })
            .from(splitExpenseParticipants)
            .innerJoin(users, eq(users.id, splitExpenseParticipants.userId))
            .where(eq(splitExpenseParticipants.splitExpenseId, expense.id))

          // Get creator name
          const [creator] = await db
            .select({
              name: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
            })
            .from(users)
            .where(eq(users.id, expense.createdBy))

          return {
            ...expense,
            participants,
            creatorName: creator?.name || "",
          }
        })
      )

      return {
        success: true,
        data: expensesWithParticipants,
      }
    } catch (error) {
      console.error("SplitExpenseService.getSplitExpenses error:", error)
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to get split expenses",
      }
    }
  }

  /**
   * Get details of a specific split expense
   */
  async getSplitExpenseDetails(splitExpenseId: string) {
    try {
      const [expense] = await db
        .select()
        .from(splitExpenses)
        .where(eq(splitExpenses.id, splitExpenseId))

      if (!expense) {
        return { success: false, message: "Split expense not found" }
      }

      const participants = await db
        .select({
          id: splitExpenseParticipants.id,
          splitExpenseId: splitExpenseParticipants.splitExpenseId,
          userId: splitExpenseParticipants.userId,
          amountOwed: splitExpenseParticipants.amountOwed,
          amountPaid: splitExpenseParticipants.amountPaid,
          isPayer: splitExpenseParticipants.isPayer,
          status: splitExpenseParticipants.status,
          settledAt: splitExpenseParticipants.settledAt,
          firstName: users.firstName,
          lastName: users.lastName,
          profilePicture: users.profilePicture,
        })
        .from(splitExpenseParticipants)
        .innerJoin(users, eq(users.id, splitExpenseParticipants.userId))
        .where(eq(splitExpenseParticipants.splitExpenseId, splitExpenseId))

      const settlementsList = await db
        .select({
          id: settlements.id,
          splitExpenseId: settlements.splitExpenseId,
          payerId: settlements.payerId,
          payeeId: settlements.payeeId,
          amount: settlements.amount,
          note: settlements.note,
          settledAt: settlements.settledAt,
        })
        .from(settlements)
        .where(eq(settlements.splitExpenseId, splitExpenseId))
        .orderBy(desc(settlements.settledAt))

      return {
        success: true,
        data: {
          ...expense,
          participants,
          settlements: settlementsList,
        },
      }
    } catch (error) {
      console.error("SplitExpenseService.getSplitExpenseDetails error:", error)
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to get details",
      }
    }
  }

  /**
   * Get all balances with friends
   */
  async getUserBalances(userId: string) {
    try {
      const balances = await db
        .select({
          friendId: userBalances.friendId,
          friendName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
          friendPhoto: users.profilePicture,
          balance: userBalances.balance,
        })
        .from(userBalances)
        .innerJoin(users, eq(users.id, userBalances.friendId))
        .where(
          and(eq(userBalances.userId, userId), ne(userBalances.balance, "0"))
        )
        .orderBy(sql`ABS(${userBalances.balance}) DESC`)

      const youOwe = balances
        .filter((b) => parseFloat(b.balance) < 0)
        .reduce((sum, b) => sum + Math.abs(parseFloat(b.balance)), 0)

      const youAreOwed = balances
        .filter((b) => parseFloat(b.balance) > 0)
        .reduce((sum, b) => sum + parseFloat(b.balance), 0)

      return {
        success: true,
        data: {
          balances,
          summary: {
            youOwe,
            youAreOwed,
            netBalance: youAreOwed - youOwe,
          },
        },
      }
    } catch (error) {
      console.error("SplitExpenseService.getUserBalances error:", error)
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to get balances",
      }
    }
  }

  /**
   * Get balance with a specific friend
   */
  async getBalanceWithFriend(userId: string, friendId: string) {
    try {
      const [balance] = await db
        .select({
          balance: userBalances.balance,
          friendName: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
        })
        .from(userBalances)
        .innerJoin(users, eq(users.id, userBalances.friendId))
        .where(
          and(
            eq(userBalances.userId, userId),
            eq(userBalances.friendId, friendId)
          )
        )

      return {
        success: true,
        data: {
          balance: balance?.balance || "0",
          friendName: balance?.friendName || "",
        },
      }
    } catch (error) {
      console.error("SplitExpenseService.getBalanceWithFriend error:", error)
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to get balance",
      }
    }
  }

  /**
   * Settle up - record a payment
   */
  async settleUp({
    splitExpenseId,
    payerId,
    payeeId,
    amount,
    note,
  }: SettleUpParams) {
    try {
      // Record the settlement
      await db.insert(settlements).values({
        splitExpenseId,
        payerId,
        payeeId,
        amount: String(amount),
        note: note || null,
      })

      // Update participant's paid amount using Drizzle update with sql template for arithmetic
      await db
        .update(splitExpenseParticipants)
        .set({
          amountPaid: sql`${splitExpenseParticipants.amountPaid} + ${amount}`,
          status: sql`CASE 
            WHEN ${splitExpenseParticipants.amountPaid} + ${amount} >= ${splitExpenseParticipants.amountOwed} THEN 'settled'
            ELSE 'pending'
          END`,
          settledAt: sql`CASE 
            WHEN ${splitExpenseParticipants.amountPaid} + ${amount} >= ${splitExpenseParticipants.amountOwed} THEN CURRENT_TIMESTAMP
            ELSE NULL
          END`,
        })
        .where(
          and(
            eq(splitExpenseParticipants.splitExpenseId, splitExpenseId),
            eq(splitExpenseParticipants.userId, payerId)
          )
        )

      // Update user balance (reduce the debt)
      await this.updateBalance(payeeId, payerId, -amount)

      // Check if all participants have settled
      const pending = await db
        .select()
        .from(splitExpenseParticipants)
        .where(
          and(
            eq(splitExpenseParticipants.splitExpenseId, splitExpenseId),
            eq(splitExpenseParticipants.status, "pending")
          )
        )

      if (pending.length === 0) {
        await db
          .update(splitExpenses)
          .set({ status: "settled", updatedAt: new Date().toISOString() })
          .where(eq(splitExpenses.id, splitExpenseId))
      } else {
        await db
          .update(splitExpenses)
          .set({
            status: "partially_settled",
            updatedAt: new Date().toISOString(),
          })
          .where(eq(splitExpenses.id, splitExpenseId))
      }

      return { success: true, message: "Settlement recorded successfully" }
    } catch (error) {
      console.error("SplitExpenseService.settleUp error:", error)
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to settle up",
      }
    }
  }

  /**
   * Get settlement history with a friend
   */
  async getSettlementHistory(userId: string, friendId: string) {
    try {
      const settlementsList = await db
        .select({
          id: settlements.id,
          splitExpenseId: settlements.splitExpenseId,
          payerId: settlements.payerId,
          payeeId: settlements.payeeId,
          amount: settlements.amount,
          note: settlements.note,
          settledAt: settlements.settledAt,
          expenseDescription: splitExpenses.description,
        })
        .from(settlements)
        .innerJoin(
          splitExpenses,
          eq(splitExpenses.id, settlements.splitExpenseId)
        )
        .where(
          or(
            and(
              eq(settlements.payerId, userId),
              eq(settlements.payeeId, friendId)
            ),
            and(
              eq(settlements.payerId, friendId),
              eq(settlements.payeeId, userId)
            )
          )
        )
        .orderBy(desc(settlements.settledAt))

      return { success: true, data: settlementsList }
    } catch (error) {
      console.error("SplitExpenseService.getSettlementHistory error:", error)
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to get history",
      }
    }
  }

  /**
   * Delete a split expense
   */
  async deleteSplitExpense(splitExpenseId: string, userId: string) {
    try {
      const [expense] = await db
        .select()
        .from(splitExpenses)
        .where(
          and(
            eq(splitExpenses.id, splitExpenseId),
            eq(splitExpenses.createdBy, userId)
          )
        )

      if (!expense) {
        return {
          success: false,
          message: "Split expense not found or you are not the creator",
        }
      }

      if (expense.status !== "pending") {
        return {
          success: false,
          message: "Cannot delete a split expense that has settlements",
        }
      }

      // Get participants to reverse balances
      const participants = await db
        .select()
        .from(splitExpenseParticipants)
        .where(eq(splitExpenseParticipants.splitExpenseId, splitExpenseId))

      const payer = participants.find((p) => p.isPayer)

      // Reverse balances
      for (const participant of participants) {
        if (!participant.isPayer && payer) {
          await this.updateBalance(
            payer.userId,
            participant.userId,
            -parseFloat(participant.amountOwed)
          )
        }
      }

      // Delete (cascade will handle participants)
      await db.delete(splitExpenses).where(eq(splitExpenses.id, splitExpenseId))

      return { success: true, message: "Split expense deleted successfully" }
    } catch (error) {
      console.error("SplitExpenseService.deleteSplitExpense error:", error)
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to delete",
      }
    }
  }

  /**
   * Helper: Update balance between two users
   */
  private async updateBalance(
    userId: string,
    friendId: string,
    amount: number
  ) {
    // Update or insert balance for userId -> friendId using onConflictDoUpdate
    await db
      .insert(userBalances)
      .values({
        userId,
        friendId,
        balance: String(amount),
      })
      .onConflictDoUpdate({
        target: [userBalances.userId, userBalances.friendId],
        set: {
          balance: sql`${userBalances.balance} + ${amount}`,
          updatedAt: new Date().toISOString(),
        },
      })

    // Update reverse balance (friendId -> userId with negative amount)
    await db
      .insert(userBalances)
      .values({
        userId: friendId,
        friendId: userId,
        balance: String(-amount),
      })
      .onConflictDoUpdate({
        target: [userBalances.userId, userBalances.friendId],
        set: {
          balance: sql`${userBalances.balance} + ${-amount}`,
          updatedAt: new Date().toISOString(),
        },
      })
  }
}

export default new SplitExpenseService()
