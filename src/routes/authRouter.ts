import express from "express"
import {
  login,
  sendOTP,
  signinWithGoogle,
  signup,
  verifyOTP,
  updatePassword,
  resetPassword,
  refreshToken,
  logout,
} from "../controllers/authController"
import authenticateJWT from "../middlewares/authenticate"

const authRouter = express.Router()

authRouter.post("/signup", signup)

authRouter.post("/login", login)

authRouter.post("/verify-otp", verifyOTP)

authRouter.post("/send-otp", sendOTP)

authRouter.post("/signin-with-google", signinWithGoogle)

authRouter.post("/reset-password", resetPassword)

// Refresh & logout must work with an expired/absent access token, so they
// live before the authenticate middleware (they carry their own refresh token).
authRouter.post("/refresh", refreshToken)
authRouter.post("/logout", logout)

authRouter.use(authenticateJWT)
authRouter.put("/update-password", updatePassword)

export default authRouter
