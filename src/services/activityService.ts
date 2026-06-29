import { db } from "../db"
import { activityLogs, users } from "../db/schema"
import { eq, or, desc, sql, and } from "drizzle-orm"
import { sendPushNotification } from "../firebaseAdmin"

interface LogActivityParams {
  userId: string // who performed the action
  targetUserId?: string // affected user (for 1:1 splits)
  groupId?: string // null for 1:1 activities
  splitExpenseId?: string
  action: string // expense_created, expense_updated, expense_deleted, settlement_created, member_added, member_removed
  description: string // human-readable description
  metadata?: Record<string, any> // additional details
}

interface NotifyParams {
  recipientUserIds: string[] // users to notify (push + in-app)
  title: string
  body: string
  data?: Record<string, string>
  type: string
  excludeUserId?: string // don't notify the actor
}

class ActivityService {
  /**
   * Log an activity and optionally send notifications
   */
  async logActivity(params: LogActivityParams) {
    try {
      const [activity] = await db
        .insert(activityLogs)
        .values({
          userId: params.userId,
          targetUserId: params.targetUserId || null,
          groupId: params.groupId || null,
          splitExpenseId: params.splitExpenseId || null,
          action: params.action,
          description: params.description,
          metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        })
        .returning()

      return { success: true, data: activity }
    } catch (error) {
      console.error("ActivityService.logActivity error:", error)
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to log activity",
      }
    }
  }

  /**
   * Log activity + send push notifications to relevant users
   */
  async logAndNotify(
    activityParams: LogActivityParams,
    notifyParams: NotifyParams
  ) {
    // Log the activity
    const result = await this.logActivity(activityParams)

    // Send push notifications
    const recipients = notifyParams.recipientUserIds.filter(
      (id) => id !== notifyParams.excludeUserId
    )

    for (const recipientId of recipients) {
      try {
        await sendPushNotification(
          recipientId,
          notifyParams.title,
          notifyParams.body,
          notifyParams.data || {},
          notifyParams.type
        )
      } catch (error) {
        console.error(`Failed to send notification to ${recipientId}:`, error)
      }
    }

    return result
  }

  /**
   * Get activity feed for a user (activities where they are actor or target)
   */
  async getUserActivityFeed(
    userId: string,
    page: number = 1,
    limit: number = 20
  ) {
    try {
      const offset = (page - 1) * limit

      const activities = await db
        .select({
          id: activityLogs.id,
          userId: activityLogs.userId,
          targetUserId: activityLogs.targetUserId,
          groupId: activityLogs.groupId,
          splitExpenseId: activityLogs.splitExpenseId,
          action: activityLogs.action,
          description: activityLogs.description,
          metadata: activityLogs.metadata,
          isRead: activityLogs.isRead,
          createdAt: activityLogs.createdAt,
          actorName: sql<string>`(SELECT "firstName" || ' ' || "lastName" FROM users WHERE id = ${activityLogs.userId})`,
          actorProfilePicture: sql<string>`(SELECT "profilePicture" FROM users WHERE id = ${activityLogs.userId})`,
        })
        .from(activityLogs)
        .where(
          or(
            eq(activityLogs.userId, userId),
            eq(activityLogs.targetUserId, userId)
          )
        )
        .orderBy(desc(activityLogs.createdAt))
        .limit(limit)
        .offset(offset)

      
      console.log('activities', activities);

      return { success: true, data: activities }
    } catch (error) {
      console.error("ActivityService.getUserActivityFeed error:", error)
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to get activity feed",
      }
    }
  }

  /**
   * Get activity feed for a specific group
   */
  async getGroupActivity(
    groupId: string,
    page: number = 1,
    limit: number = 20
  ) {
    try {
      const offset = (page - 1) * limit

      const activities = await db
        .select({
          id: activityLogs.id,
          userId: activityLogs.userId,
          targetUserId: activityLogs.targetUserId,
          groupId: activityLogs.groupId,
          splitExpenseId: activityLogs.splitExpenseId,
          action: activityLogs.action,
          description: activityLogs.description,
          metadata: activityLogs.metadata,
          isRead: activityLogs.isRead,
          createdAt: activityLogs.createdAt,
          actorName: sql<string>`(SELECT "firstName" || ' ' || "lastName" FROM users WHERE id = ${activityLogs.userId})`,
        })
        .from(activityLogs)
        .where(eq(activityLogs.groupId, groupId))
        .orderBy(desc(activityLogs.createdAt))
        .limit(limit)
        .offset(offset)

      return { success: true, data: activities }
    } catch (error) {
      console.error("ActivityService.getGroupActivity error:", error)
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to get group activity",
      }
    }
  }

  /**
   * Get all activity logs for a specific expense
   */
  async getExpenseActivity(splitExpenseId: string) {
    try {
      const activities = await db
        .select({
          id: activityLogs.id,
          userId: activityLogs.userId,
          action: activityLogs.action,
          description: activityLogs.description,
          metadata: activityLogs.metadata,
          createdAt: activityLogs.createdAt,
          actorName: sql<string>`(SELECT "firstName" || ' ' || "lastName" FROM users WHERE id = ${activityLogs.userId})`,
        })
        .from(activityLogs)
        .where(eq(activityLogs.splitExpenseId, splitExpenseId))
        .orderBy(desc(activityLogs.createdAt))

      return { success: true, data: activities }
    } catch (error) {
      console.error("ActivityService.getExpenseActivity error:", error)
      return {
        success: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to get expense activity",
      }
    }
  }

  /**
   * Mark an activity as read
   */
  async markAsRead(activityId: string) {
    try {
      await db
        .update(activityLogs)
        .set({ isRead: true })
        .where(eq(activityLogs.id, activityId))

      return { success: true, message: "Activity marked as read" }
    } catch (error) {
      console.error("ActivityService.markAsRead error:", error)
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to mark as read",
      }
    }
  }

  /**
   * Get unread activity count for a user
   */
  async getUnreadCount(userId: string) {
    try {
      const result = await db
        .select({
          count: sql<number>`count(*)::int`,
        })
        .from(activityLogs)
        .where(
          and(
            or(
              eq(activityLogs.targetUserId, userId),
              eq(activityLogs.userId, userId)
            ),
            eq(activityLogs.isRead, false)
          )
        )

      return { success: true, data: { count: result[0]?.count || 0 } }
    } catch (error) {
      console.error("ActivityService.getUnreadCount error:", error)
      return {
        success: false,
        message:
          error instanceof Error ? error.message : "Failed to get unread count",
      }
    }
  }
}

export default new ActivityService()
