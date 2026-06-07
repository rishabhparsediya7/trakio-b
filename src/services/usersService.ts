import { db } from "../db"
import { users, userFinancialSummary } from "../db/schema"
import { or, ilike, and, ne, eq, sql } from "drizzle-orm"

interface User {
  id: string
  name?: string
  firstName: string
  lastName: string
  email: string
  phoneNumber: string
  profilePicture: string
  createdAt: Date
  updatedAt: Date
  provider: string
  budget: string
  totalIncome: string
}

class UsersService {
  async getUserById(userId: string) {
    try {
      const result = await db
        .select({
          id: users.id,
          name: sql<string>`${users.firstName} || ' ' || ${users.lastName}`,
          email: users.email,
          phoneNumber: users.phoneNumber,
          profilePicture: users.profilePicture,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
          provider: users.provider,
          budget: userFinancialSummary.budget,
          totalIncome: userFinancialSummary.totalIncome,
          amountSpent: sql<string>`(
            SELECT COALESCE(SUM(amount), 0) 
            FROM expenses 
            WHERE "userId" = ${users.id} 
            AND EXTRACT(MONTH FROM "expenseDate") = EXTRACT(MONTH FROM CURRENT_DATE)
            AND EXTRACT(YEAR FROM "expenseDate") = EXTRACT(YEAR FROM CURRENT_DATE)
          )`,
        })
        .from(users)
        .leftJoin(
          userFinancialSummary,
          and(
            eq(userFinancialSummary.userId, users.id),
            eq(
              userFinancialSummary.month,
              sql`EXTRACT(MONTH FROM CURRENT_DATE)`
            ),
            eq(userFinancialSummary.year, sql`EXTRACT(YEAR FROM CURRENT_DATE)`)
          )
        )
        .where(eq(users.id, userId))
        .limit(1)

      if (result.length === 0) {
        return {
          success: false,
          message: "User not found",
        }
      }

      const user = result[0]
      return {
        success: true,
        message: "User fetched successfully",
        userId: user.id,
        user: {
          ...user,
          userLoginProvider: user.provider,
          createdAt: new Date(user.createdAt || ""),
          updatedAt: new Date(user.updatedAt || ""),
        },
      }
    } catch (error) {
      console.log("🚀 ~ UsersService ~ getUserById ~ error:", error)
      return {
        success: false,
        message: (error as Error).message,
      }
    }
  }

  async updateUser(userId: string, data: Record<string, any>) {
    try {
      const firstName = data.name.split(" ")[0]
      const lastName = data.name.split(" ")[1]

      await db
        .update(users)
        .set({
          firstName,
          lastName,
          email: data.email,
          phoneNumber: data.phoneNumber,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(users.id, userId))

      return {
        success: true,
        message: "User updated successfully",
      }
    } catch (error) {
      console.log("🚀 ~ updateUser ~ error:", error)
      return {
        success: false,
        message: (error as Error).message,
      }
    }
  }

  async getProfilePic(userId: string) {
    try {
      const result = await db
        .select({ profilePicture: users.profilePicture })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1)

      if (result.length === 0) {
        return {
          success: false,
          message: "User not found",
        }
      }

      return {
        success: true,
        message: "Profile picture fetched successfully",
        profile_picture: result[0].profilePicture,
      }
    } catch (error) {
      console.log("🚀 ~ UsersService ~ getProfilePic ~ error:", error)
      return {
        success: false,
        message: (error as Error).message,
      }
    }
  }

  async updateProfilePicture(userId: string, r2Key: string) {
    try {
      await db
        .update(users)
        .set({ profilePicture: r2Key })
        .where(eq(users.id, userId))

      return {
        success: true,
        message: "Profile picture updated successfully",
      }
    } catch (error) {
      console.log("🚀 ~ UsersService ~ updateProfilePicture ~ error:", error)
      return {
        success: false,
        message: (error as Error).message,
      }
    }
  }
  async searchUsers(query: string, currentUserId: string) {
    try {
      const results = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          phoneNumber: users.phoneNumber,
          profilePicture: users.profilePicture,
        })
        .from(users)
        .where(
          and(
            ne(users.id, currentUserId),
            eq(users.isPlaceholder, false),
            or(
              ilike(users.email, `%${query}%`),
              ilike(users.phoneNumber, `%${query}%`)
            )
          )
        )
        .limit(20)

      return {
        success: true,
        users: results,
      }
    } catch (error) {
      console.log("🚀 ~ UsersService ~ searchUsers ~ error:", error)
      return {
        success: false,
        message: (error as Error).message,
      }
    }
  }

  /**
   * Resolve a contact to a user id for splitting: returns an existing
   * user/placeholder (matched by email, or phone as a dedupe hint), or creates
   * a new placeholder. Email is required — it's the (free) invite + claim key.
   */
  async resolveContact(params: {
    name?: string
    email?: string
    phone?: string
  }) {
    try {
      const email = params.email?.trim().toLowerCase() || ""
      const phone = params.phone?.trim() || ""

      if (!email) {
        return { success: false, message: "Email is required to invite someone" }
      }

      // Match an existing user or placeholder by email, or by phone if given.
      const matchers = [eq(users.email, email)]
      if (phone) matchers.push(eq(users.phoneNumber, phone))

      const existing = await db
        .select({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          phoneNumber: users.phoneNumber,
          profilePicture: users.profilePicture,
          isPlaceholder: users.isPlaceholder,
        })
        .from(users)
        .where(or(...matchers))
        .limit(1)

      if (existing.length > 0) {
        return { success: true, isNew: false, user: existing[0] }
      }

      // Create a placeholder for the not-yet-registered person.
      const nameParts = (params.name || "").trim().split(" ").filter(Boolean)
      const firstName = nameParts[0] || email.split("@")[0]
      const lastName = nameParts.slice(1).join(" ")

      const created = await db
        .insert(users)
        .values({
          firstName,
          lastName,
          email,
          phoneNumber: phone || null,
          passwordHash: "",
          provider: "invited",
          isPlaceholder: true,
        })
        .returning({
          id: users.id,
          firstName: users.firstName,
          lastName: users.lastName,
          email: users.email,
          phoneNumber: users.phoneNumber,
          profilePicture: users.profilePicture,
          isPlaceholder: users.isPlaceholder,
        })

      return { success: true, isNew: true, user: created[0] }
    } catch (error) {
      console.log("🚀 ~ UsersService ~ resolveContact ~ error:", error)
      return { success: false, message: (error as Error).message }
    }
  }
}

export default new UsersService()
