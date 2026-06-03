import jwt from "jsonwebtoken"
import bcrypt from "bcrypt"
import { sendSignupEmail, sendForgotPasswordEmail } from "../utils/sendMail"
import { db } from "../db/index"
import { users, otpTransactions } from "../db/schema"
import { eq, desc, and } from "drizzle-orm"

const JWT_SECRET = (process.env.JWT_SECRET as string) || "secret"
const JWT_EXPIRATION_MINUTES =
  parseInt(process.env.JWT_EXPIRATION_MINUTES || "60") * 60

class AuthService {
  async signup(
    email: string,
    firstName: string,
    lastName: string,
    password: string
  ) {
    const saltRounds = 10
    const passwordHash = await bcrypt.hash(password, saltRounds)

    try {
      const isUserExist = await db
        .select()
        .from(users)
        .where(eq(users.email, email))

      if (isUserExist.length > 0) {
        return {
          success: false,
          message: "User already exists",
        }
      }

      const otp = Math.floor(100000 + Math.random() * 900000).toString()
      await sendSignupEmail({ email, otp })

      const result = await db
        .insert(users)
        .values({
          email,
          firstName,
          lastName,
          passwordHash,
          provider: "email",
        })
        .returning({ id: users.id })

      const expiresAt = new Date()
      expiresAt.setMinutes(
        expiresAt.getMinutes() +
          parseInt(String(process.env.OTP_EXPIRATION_MINUTES || 10))
      )

      await db.insert(otpTransactions).values({
        email,
        otp,
        context: "signup",
        expiresAt: expiresAt.toISOString(),
      })

      const userId = result[0]?.id
      const token = jwt.sign({ userId }, JWT_SECRET, {
        expiresIn: JWT_EXPIRATION_MINUTES,
      })

      return {
        success: true,
        message: "User Entry created",
        token,
        userId,
      }
    } catch (error) {
      console.log("🚀 ~ AuthServices ~ singup ~ error:", error)

      return {
        success: false,
        message: error,
      }
    }
  }

  async findOrCreate(
    email: string,
    firstName: string,
    lastName: string,
    profilePicture: string
  ) {
    try {
      let token = ""

      const isUserExist = await db
        .select()
        .from(users)
        .where(eq(users.email, email))

      if (isUserExist.length > 0) {
        token = jwt.sign({ userId: isUserExist[0]?.id }, JWT_SECRET, {
          expiresIn: JWT_EXPIRATION_MINUTES,
        })

        return {
          success: true,
          message: "Login successful",
          name: firstName + " " + lastName,
          token,
          userId: isUserExist[0]?.id,
          photoUrl: profilePicture,
          email: email,
        }
      }

      const result = await db
        .insert(users)
        .values({
          email,
          firstName,
          lastName,
          passwordHash: "",
          profilePicture,
          provider: "google",
          isEmailVerified: true,
        })
        .returning({ id: users.id })

      const userId = result[0]?.id
      token = jwt.sign({ userId }, JWT_SECRET, {
        expiresIn: JWT_EXPIRATION_MINUTES,
      })

      return {
        success: true,
        message: "User Entry created",
        token,
        name: firstName + " " + lastName,
        userId,
        photoUrl: profilePicture,
        email: email,
      }
    } catch (error) {
      console.log("🚀 ~ AuthServices ~ findOrCreate ~ error:", error)

      return {
        success: false,
        message: "Something went wrong. Please try again.",
      }
    }
  }

  async login(email: string, password: string) {
    try {
      const result = await db.select().from(users).where(eq(users.email, email))

      if (result.length === 0) {
        return {
          success: false,
          message: "User not found",
        }
      }

      const user = result[0]

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash)

      if (!isPasswordValid) {
        return {
          success: false,
          message: "Invalid password",
        }
      }

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
        expiresIn: JWT_EXPIRATION_MINUTES,
      })

      return {
        success: true,
        message: "Login successful",
        name: user.firstName + " " + user.lastName,
        token,
        userId: user.id,
      }
    } catch (error) {
      console.log("🚀 ~ AuthServices ~ login ~ error:", error)
      return {
        success: false,
        message: "Login failed",
      }
    }
  }

  async sendOTP(email: string) {
    try {
      const otp = Math.floor(100000 + Math.random() * 900000).toString()

      const rows = await db.select().from(users).where(eq(users.email, email))

      if (rows.length === 0) {
        return { success: false, message: "User not found" }
      }

      const user = rows[0]

      const expiresAt = new Date()
      expiresAt.setMinutes(
        expiresAt.getMinutes() +
          parseInt(String(process.env.OTP_EXPIRATION_MINUTES || 10))
      )

      await db.insert(otpTransactions).values({
        email,
        otp,
        context: "forgot_password",
        expiresAt: expiresAt.toISOString(),
      })

      await sendForgotPasswordEmail({ email, otp })
      return {
        success: true,
        email: user.email,
        message: "OTP sent successfully",
        otp,
        otpExpiration: expiresAt,
      }
    } catch (error) {
      console.log("🚀 ~ AuthServices ~ sendOTP ~ error:", error)
      return { success: false, message: "Failed to send OTP" }
    }
  }

  async verifyOTP(email: string, otp: string) {
    try {
      const otpQuery = await db
        .select()
        .from(otpTransactions)
        .where(
          and(
            eq(otpTransactions.email, email),
            eq(otpTransactions.otp, otp),
            eq(otpTransactions.isUsed, false)
          )
        )
        .orderBy(desc(otpTransactions.createdAt))
        .limit(1)

      if (otpQuery.length === 0) {
        return { success: false, message: "Invalid OTP" }
      }

      const otpRecord = otpQuery[0]
      if (new Date() > new Date(otpRecord.expiresAt)) {
        return { success: false, message: "OTP expired" }
      }

      await db
        .update(otpTransactions)
        .set({ isUsed: true })
        .where(eq(otpTransactions.id, otpRecord.id))

      const updateResult = await db
        .update(users)
        .set({ isEmailVerified: true })
        .where(eq(users.email, email))
        .returning({ id: users.id })

      if (updateResult.length === 0) {
        return { success: false, message: "User not found" }
      }

      const user = updateResult[0]

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
        expiresIn: JWT_EXPIRATION_MINUTES,
      })

      return { success: true, message: "Email verified successfully", token }
    } catch (error) {
      console.log("🚀 ~ AuthServices ~ verifyOTP ~ error:", error)
      return { success: false, message: "Failed to verify OTP" }
    }
  }

  async updatePassword(
    userId: string,
    currentPassword: string,
    newPassword: string
  ) {
    try {
      const result = await db.select().from(users).where(eq(users.id, userId))

      if (result.length === 0) {
        return { success: false, message: "User not found" }
      }

      const userPasswordHash = result[0].passwordHash
      const isLoginProviderEmail = result[0].provider === "email"

      if (isLoginProviderEmail && currentPassword) {
        const isPasswordValid = await bcrypt.compare(
          currentPassword,
          userPasswordHash
        )
        if (!isPasswordValid) {
          return { success: false, message: "Invalid current password" }
        }
      }

      const saltRounds = 10
      const passwordHash = await bcrypt.hash(newPassword, saltRounds)

      await db.update(users).set({ passwordHash }).where(eq(users.id, userId))

      return { success: true, message: "Password updated successfully" }
    } catch (error) {
      console.log("🚀 ~ AuthServices ~ updatePassword ~ error:", error)
      return { success: false, message: "Failed to update password" }
    }
  }

  // Helper method for reset password flow
  async resetPassword(email: string, otp: string, newPassword: string) {
    try {
      const otpQuery = await db
        .select()
        .from(otpTransactions)
        .where(
          and(
            eq(otpTransactions.email, email),
            eq(otpTransactions.otp, otp),
            eq(otpTransactions.isUsed, false),
            eq(otpTransactions.context, "forgot_password")
          )
        )
        .orderBy(desc(otpTransactions.createdAt))
        .limit(1)

      if (otpQuery.length === 0) {
        return { success: false, message: "Invalid OTP" }
      }

      const otpRecord = otpQuery[0]
      if (new Date() > new Date(otpRecord.expiresAt)) {
        return { success: false, message: "OTP expired" }
      }

      await db
        .update(otpTransactions)
        .set({ isUsed: true })
        .where(eq(otpTransactions.id, otpRecord.id))

      const saltRounds = 10
      const passwordHash = await bcrypt.hash(newPassword, saltRounds)

      const result = await db
        .update(users)
        .set({ passwordHash })
        .where(eq(users.email, email))
        .returning({ id: users.id })

      if (result.length === 0) {
        return { success: false, message: "User not found" }
      }

      return { success: true, message: "Password reset successfully" }
    } catch (error) {
      console.log("🚀 ~ AuthServices ~ resetPassword ~ error:", error)
      return { success: false, message: "Failed to reset password" }
    }
  }
}

export default new AuthService()
