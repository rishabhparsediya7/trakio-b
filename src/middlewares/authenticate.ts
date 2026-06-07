import jwt from "jsonwebtoken"
import { NextFunction, Request, Response } from "express"
const JWT_SECRET = process.env.JWT_SECRET ?? ""

const authenticateJWT = (req: Request, res: Response, next: NextFunction) => {
  const token = req.header("Authorization")?.replace("Bearer ", "")

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Access denied. No token provided.",
    })
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      // Expired access token → 401 so the client refreshes and retries.
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          success: false,
          code: "TOKEN_EXPIRED",
          message: "Access token expired.",
        })
      }
      // Tampered / malformed token → 403, no refresh.
      return res.status(403).json({
        success: false,
        message: "Invalid token.",
      })
    }
    req.userId = (decoded as jwt.JwtPayload)?.userId
    next()
  })
}

export default authenticateJWT
