import { Request, Response } from "express"
import AuthService from "../services/authService"
import { verifyGoogleToken } from "../utils/auth"

export const signinWithGoogle = async (req: Request, res: Response) => {
  const idToken = req.headers["id-token"] as string
  if (!idToken) {
    return res.status(400).json({ error: "ID token is required" })
  }
  const payload = await verifyGoogleToken(idToken)
  const response = await AuthService.findOrCreate(
    payload.email!,
    payload.given_name!,
    payload.family_name!,
    payload.picture!
  )
  if (response.success) {
    res.status(200).json(response)
  } else {
    res.status(400).json(response)
  }
}

export const signup = async (req: Request, res: Response) => {
  const { email, firstName, lastName, password } = req.body
  if (!email || !firstName || !lastName || !password) {
    console.log(email, firstName, lastName, password)
    return res
      .status(400)
      .json({ error: "Inputs are required - Email / First Name / Last Name" })
  }

  const response = await AuthService.signup(
    email,
    firstName,
    lastName,
    password
  )
  if (response.success) {
    res.status(200).json(response)
  } else {
    res.status(400).json(response)
  }
}

export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body
  if (!email || !password) {
    return res
      .status(400)
      .json({ error: "Inputs are required - Email/Name/Phone Number" })
  }
  const response = await AuthService.login(email, password)
  if (response.success) {
    res.status(200).json(response)
  } else {
    res.status(400).json(response)
  }
}

export const verifyOTP = async (req: Request, res: Response) => {
  const { email, otp } = req.body
  if (!email || !otp) {
    return res.status(400).json({ error: "Email and OTP are required" })
  }
  const response = await AuthService.verifyOTP(email, otp)
  if (response.success) {
    res.status(200).json(response)
  } else {
    res.status(400).json(response)
  }
}

export const sendOTP = async (req: Request, res: Response) => {
  const { email } = req.body
  if (!email) {
    return res.status(400).json({ error: "Email is required" })
  }
  const response = await AuthService.sendOTP(email)
  if (response.success) {
    res.status(200).json(response)
  } else {
    res.status(400).json(response)
  }
}

export const updatePassword = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized User" })
    }
    const { currentPassword, password, confirmPassword } = req.body

    if (!password) {
      return res
        .status(400)
        .json({ success: false, message: "Password is required" })
    }

    if (!confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Confirm password is required" })
    }

    if (password !== confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Passwords do not match" })
    }

    const response = await AuthService.updatePassword(
      userId!,
      currentPassword,
      password
    )
    if (response.success) {
      return res.status(200).json(response)
    } else {
      return res.status(400).json(response)
    }
  } catch (error) {
    return res.status(500).json({ error: "Internal Server Error" })
  }
}

export const resetPassword = async (req: Request, res: Response) => {
  const { email, otp, newPassword } = req.body
  if (!email || !otp || !newPassword) {
    return res
      .status(400)
      .json({ error: "Email, OTP, and newPassword are required" })
  }
  const response = await AuthService.resetPassword(email, otp, newPassword)
  if (response.success) {
    res.status(200).json(response)
  } else {
    res.status(400).json(response)
  }
}

export const refreshToken = async (req: Request, res: Response) => {
  const { refreshToken } = req.body
  if (!refreshToken) {
    return res.status(400).json({ success: false, message: "Refresh token is required" })
  }
  const response = await AuthService.refreshAccessToken(refreshToken)
  if (response.success) {
    res.status(200).json(response)
  } else {
    // 401 so the client treats it as "session over" and routes to login.
    res.status(401).json(response)
  }
}

export const logout = async (req: Request, res: Response) => {
  const { refreshToken } = req.body
  const response = await AuthService.revokeRefreshToken(refreshToken)
  res.status(200).json(response)
}
