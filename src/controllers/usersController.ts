import { Request, Response } from "express"
import UsersService from "../services/usersService"
import MediaService from "../services/mediaService"

export const getUserById = async (req: Request, res: Response) => {
  const userId = req?.userId

  if (!userId) {
    return res.status(400).json({ error: "Unauthorized User" })
  }

  const response = await UsersService.getUserById(userId)
  if (response.success && response.user?.profilePicture) {
    try {
      response.user.profilePicture = await MediaService.getPresignedUrl(
        response.user.profilePicture
      )
    } catch {
      // R2 object not found — leave as-is
    }
  }

  if (response.success) {
    res.status(200).json(response)
  } else {
    res.status(400).json(response)
  }
}

export const getProfilePic = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized User" })
    }

    const url = await MediaService.getProfilePictureUrl(userId)
    res.json({ url })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

export const uploadProfilePic = async (req: Request, res: Response) => {
  try {
    const userId = req?.userId

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized User" })
    }

    const filePath = req.file?.path
    if (!filePath) return res.status(400).json({ error: "No file uploaded" })

    const { key, url } = await MediaService.uploadProfilePicture(
      userId,
      filePath,
      req.file?.mimetype || "image/jpeg"
    )

    await UsersService.updateProfilePicture(userId, key)

    res.json({ message: "Uploaded successfully", url })
  } catch (err: any) {
    res.status(500).json({ error: err.message })
  }
}

export const updateProfile = async (req: Request, res: Response) => {
  const userId = req?.userId

  if (!userId) {
    return res.status(400).json({ error: "Unauthorized User" })
  }

  const response = await UsersService.updateUser(userId, req.body)
  if (response.success) {
    res.status(200).json(response)
  } else {
    res.status(400).json(response)
  }
}

export const searchUsers = async (req: Request, res: Response) => {
  const userId = req?.userId
  const query = req.query.q as string

  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  if (!query) {
    return res.status(400).json({ error: "Search query is required" })
  }

  const response = await UsersService.searchUsers(query, userId)
  if (response.success) {
    res.status(200).json(response)
  } else {
    res.status(500).json(response)
  }
}

export const resolveContact = async (req: Request, res: Response) => {
  const userId = req?.userId
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" })
  }

  const { name, email, phone } = req.body
  const response = await UsersService.resolveContact({ name, email, phone })
  if (response.success) {
    res.status(200).json(response)
  } else {
    res.status(400).json(response)
  }
}
