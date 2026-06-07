import {
  pgTable,
  serial,
  varchar,
  unique,
  uuid,
  text,
  timestamp,
  boolean,
  foreignKey,
  numeric,
  integer,
  check,
  smallint,
} from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const category = pgTable("category", {
  id: serial().primaryKey().notNull(),
  name: varchar({ length: 100 }).notNull(),
})

export const users = pgTable(
  "users",
  {
    id: uuid()
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),
    firstName: varchar({ length: 100 }).notNull(),
    lastName: varchar({ length: 100 }).notNull(),
    email: varchar({ length: 150 }).notNull(),
    phoneNumber: varchar({ length: 15 }),
    passwordHash: text().notNull(),
    otp: varchar({ length: 10 }),
    otpCreatedAt: timestamp({ withTimezone: true, mode: "string" }),
    otpExpiration: timestamp({ withTimezone: true, mode: "string" }),
    isEmailVerified: boolean().default(false),
    createdAt: timestamp({ withTimezone: true, mode: "string" }).default(
      sql`CURRENT_TIMESTAMP`
    ),
    updatedAt: timestamp({ withTimezone: true, mode: "string" }).default(
      sql`CURRENT_TIMESTAMP`
    ),
    profilePicture: text(),
    provider: text(),
    isPremium: boolean().default(false).notNull(),
    // True for invited-but-not-registered users (created when someone splits
    // with a person who isn't on the app yet). Claimed on signup.
    isPlaceholder: boolean().default(false).notNull(),
  },
  (table) => [unique("users_email_key").on(table.email)]
)

export const expenses = pgTable(
  "expenses",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid(),
    amount: numeric({ precision: 10, scale: 2 }).notNull(),
    categoryId: integer(),
    description: text(),
    expenseDate: timestamp({ withTimezone: true, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdAt: timestamp({ withTimezone: true, mode: "string" }).default(
      sql`CURRENT_TIMESTAMP`
    ),
    updatedAt: timestamp({ withTimezone: true, mode: "string" }).default(
      sql`CURRENT_TIMESTAMP`
    ),
    paymentMethodId: integer(),
  },
  (table) => [
    foreignKey({
      columns: [table.categoryId],
      foreignColumns: [category.id],
      name: "expenses_categoryId_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "expenses_userId_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.categoryId],
      foreignColumns: [category.id],
      name: "fk_category",
    }).onDelete("cascade"),
  ]
)

export const paymentMethod = pgTable("paymentMethod", {
  id: serial().primaryKey().notNull(),
  name: varchar({ length: 100 }).notNull(),
})

export const userFinancialSummary = pgTable(
  "userFinancialSummary",
  {
    id: uuid()
      .default(sql`uuid_generate_v4()`)
      .primaryKey()
      .notNull(),
    userId: uuid().notNull(),
    totalIncome: numeric({ precision: 12, scale: 2 }).default("0").notNull(),
    budget: numeric({ precision: 12, scale: 2 }),
    amountSpent: numeric({ precision: 12, scale: 2 }).default("0"),
    amountSaved: numeric({ precision: 12, scale: 2 }).default("0"),
    createdAt: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp({ withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    month: smallint().notNull(),
    year: smallint().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "userFinancialSummary_userId_fkey",
    }).onDelete("cascade"),
    unique("user_month_year_unique").on(table.userId, table.month, table.year),
    unique("unique_user_month").on(table.userId, table.month, table.year),
    check(
      "userFinancialSummary_month_check",
      sql`(month >= 1) AND (month <= 12)`
    ),
    check("userFinancialSummary_year_check", sql`year >= 2000`),
  ]
)

export const messages = pgTable(
  "messages",
  {
    id: serial().primaryKey().notNull(),
    senderId: uuid("sender_id"),
    receiverId: uuid("receiver_id"),
    message: text().notNull(),
    nonce: text().notNull(),
    sentAt: timestamp("sent_at", { mode: "string" }).defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.receiverId],
      foreignColumns: [users.id],
      name: "messages_receiver_id_fkey",
    }),
    foreignKey({
      columns: [table.senderId],
      foreignColumns: [users.id],
      name: "messages_sender_id_fkey",
    }),
  ]
)

export const friends = pgTable(
  "friends",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid("user_id").notNull(),
    friendId: uuid("friend_id").notNull(),
    status: varchar({ length: 20 }).default("pending").notNull(), // pending, accepted, rejected
    createdAt: timestamp("created_at", { mode: "string" }).defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.friendId],
      foreignColumns: [users.id],
      name: "friends_friend_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "friends_user_id_fkey",
    }).onDelete("cascade"),
    unique("friends_user_id_friend_id_key").on(table.userId, table.friendId),
  ]
)

// ======================================
// Group Tables
// ======================================

export const groups = pgTable(
  "groups",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    name: varchar({ length: 255 }).notNull(),
    description: text(),
    image: text(),
    type: varchar("type", { length: 20 }).default("general").notNull(),
    createdByUser: uuid("createdByUser").notNull(),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      mode: "string",
    }).defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      mode: "string",
    }).defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.createdByUser],
      foreignColumns: [users.id],
      name: "groups_createdByUser_fkey",
    }).onDelete("cascade"),
  ]
)

export const groupMembers = pgTable(
  "groupMembers",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    groupId: uuid("groupId").notNull(),
    userId: uuid("userId").notNull(),
    createdAt: timestamp("created_at", { mode: "string" }).defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.groupId],
      foreignColumns: [groups.id],
      name: "groupMembers_groupId_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "groupMembers_userId_fkey",
    }).onDelete("cascade"),
    unique("groupMembers_groupId_userId_key").on(table.groupId, table.userId),
  ]
)

export const userPassphrases = pgTable(
  "userPassphrases",
  {
    userId: uuid().primaryKey().notNull(),
    cipherText: text().notNull(),
    iv: text().notNull(),
    createdAt: timestamp({ mode: "string" }).defaultNow(),
    updatedAt: timestamp({ mode: "string" }).defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "userPassphrases_userId_fkey",
    }),
  ]
)

export const userKeys = pgTable(
  "userKeys",
  {
    userId: uuid().primaryKey().notNull(),
    publicKey: text().notNull(),
    encryptedPrivateKey: text().notNull(),
    createdAt: timestamp({ mode: "string" }).defaultNow(),
    updatedAt: timestamp({ mode: "string" }).defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "userKeys_userId_fkey",
    }),
  ]
)

// ======================================
// Split Expense Tables
// ======================================

export const splitExpenses = pgTable(
  "splitExpenses",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    createdBy: uuid("created_by").notNull(),
    paidBy: uuid("paid_by").notNull(),
    description: text().notNull(),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
    category: integer(),
    groupId: uuid("group_id"),
    splitType: varchar("split_type", { length: 20 }).default("equal").notNull(),
    expenseDate: timestamp("expense_date", {
      withTimezone: true,
      mode: "string",
    })
      .defaultNow()
      .notNull(),
    status: varchar({ length: 20 }).default("pending").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.createdBy],
      foreignColumns: [users.id],
      name: "splitExpenses_created_by_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.paidBy],
      foreignColumns: [users.id],
      name: "splitExpenses_paid_by_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.category],
      foreignColumns: [category.id],
      name: "splitExpenses_category_fkey",
    }).onDelete("set null"),
    foreignKey({
      columns: [table.groupId],
      foreignColumns: [groups.id],
      name: "splitExpenses_group_id_fkey",
    }).onDelete("cascade"),
  ]
)

export const splitExpenseParticipants = pgTable(
  "splitExpenseParticipants",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    splitExpenseId: uuid("split_expense_id").notNull(),
    userId: uuid("user_id").notNull(),
    amountOwed: numeric("amount_owed", { precision: 12, scale: 2 }).notNull(),
    amountPaid: numeric("amount_paid", { precision: 12, scale: 2 })
      .default("0")
      .notNull(),
    isPayer: boolean("is_payer").default(false).notNull(),
    status: varchar({ length: 20 }).default("pending").notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true, mode: "string" }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.splitExpenseId],
      foreignColumns: [splitExpenses.id],
      name: "splitExpenseParticipants_split_expense_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "splitExpenseParticipants_user_id_fkey",
    }).onDelete("cascade"),
  ]
)

export const settlements = pgTable(
  "settlements",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    splitExpenseId: uuid("split_expense_id").notNull(),
    payerId: uuid("payer_id").notNull(),
    payeeId: uuid("payee_id").notNull(),
    amount: numeric({ precision: 12, scale: 2 }).notNull(),
    note: text(),
    settledAt: timestamp("settled_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.splitExpenseId],
      foreignColumns: [splitExpenses.id],
      name: "settlements_split_expense_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.payerId],
      foreignColumns: [users.id],
      name: "settlements_payer_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.payeeId],
      foreignColumns: [users.id],
      name: "settlements_payee_id_fkey",
    }).onDelete("cascade"),
  ]
)

export const userBalances = pgTable(
  "userBalances",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid("user_id").notNull(),
    friendId: uuid("friend_id").notNull(),
    balance: numeric({ precision: 12, scale: 2 }).default("0").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "userBalances_user_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.friendId],
      foreignColumns: [users.id],
      name: "userBalances_friend_id_fkey",
    }).onDelete("cascade"),
    unique("userBalances_user_friend_unique").on(table.userId, table.friendId),
  ]
)

// ======================================
// OTP Transactions Table
// ======================================

export const otpTransactions = pgTable("otpTransactions", {
  id: uuid().defaultRandom().primaryKey().notNull(),
  email: varchar({ length: 150 }).notNull(),
  otp: varchar({ length: 10 }).notNull(),
  context: varchar({ length: 50 }).notNull(), // 'signup', 'forgot_password', etc
  isUsed: boolean().default(false).notNull(),
  expiresAt: timestamp({ withTimezone: true, mode: "string" }).notNull(),
  createdAt: timestamp({ withTimezone: true, mode: "string" })
    .defaultNow()
    .notNull(),
})

export const deviceTokens = pgTable(
  "deviceTokens",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid().notNull(),
    token: text().notNull(),
    platform: varchar({ length: 20 }).notNull(), // ios, android
    createdAt: timestamp({ withTimezone: true, mode: "string" }).defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "deviceTokens_userId_fkey",
    }).onDelete("cascade"),
    unique("deviceTokens_userId_token_key").on(table.userId, table.token),
  ]
)

export const notifications = pgTable(
  "notifications",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    data: text(), // JSON string
    type: varchar({ length: 50 }),
    isRead: boolean().default(false).notNull(),
    createdAt: timestamp({ withTimezone: true, mode: "string" }).defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "notifications_userId_fkey",
    }).onDelete("cascade"),
  ]
)

// ======================================
// Group Messages Table (Premium-gated chat)
// ======================================

export const groupMessages = pgTable(
  "groupMessages",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    groupId: uuid("group_id").notNull(),
    senderId: uuid("sender_id").notNull(),
    message: text().notNull(),
    messageType: varchar("message_type", { length: 20 })
      .default("text")
      .notNull(), // text, expense_added, settlement, member_joined, member_left
    metadata: text(), // JSON string: { expenseId, amount, etc. }
    sentAt: timestamp("sent_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.groupId],
      foreignColumns: [groups.id],
      name: "groupMessages_group_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.senderId],
      foreignColumns: [users.id],
      name: "groupMessages_sender_id_fkey",
    }).onDelete("cascade"),
  ]
)

// ======================================
// Group Balances Table
// ======================================

export const groupBalances = pgTable(
  "groupBalances",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    groupId: uuid("group_id").notNull(),
    userId: uuid("user_id").notNull(),
    friendId: uuid("friend_id").notNull(),
    balance: numeric({ precision: 12, scale: 2 }).default("0").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.groupId],
      foreignColumns: [groups.id],
      name: "groupBalances_group_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "groupBalances_user_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.friendId],
      foreignColumns: [users.id],
      name: "groupBalances_friend_id_fkey",
    }).onDelete("cascade"),
    unique("groupBalances_group_user_friend_unique").on(
      table.groupId,
      table.userId,
      table.friendId
    ),
  ]
)

// ======================================
// Activity Logs Table
// ======================================

export const activityLogs = pgTable(
  "activityLogs",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid("user_id").notNull(), // who performed the action
    targetUserId: uuid("target_user_id"), // affected user (for 1:1 splits)
    groupId: uuid("group_id"), // null for 1:1 activities
    splitExpenseId: uuid("split_expense_id"),
    action: varchar({ length: 30 }).notNull(), // expense_created, expense_updated, expense_deleted, settlement_created, member_added, member_removed
    description: text().notNull(), // human-readable description
    metadata: text(), // JSON string with additional details
    isRead: boolean().default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "activityLogs_user_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.targetUserId],
      foreignColumns: [users.id],
      name: "activityLogs_target_user_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.groupId],
      foreignColumns: [groups.id],
      name: "activityLogs_group_id_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.splitExpenseId],
      foreignColumns: [splitExpenses.id],
      name: "activityLogs_split_expense_id_fkey",
    }).onDelete("cascade"),
  ]
)

// ======================================
// Refresh Tokens Table (rotating refresh tokens for auth)
// ======================================

export const refreshTokens = pgTable(
  "refreshTokens",
  {
    id: uuid().defaultRandom().primaryKey().notNull(),
    userId: uuid("userId").notNull(),
    tokenHash: varchar({ length: 64 }).notNull(), // sha256 hex of the refresh token
    expiresAt: timestamp({ withTimezone: true, mode: "string" }).notNull(),
    createdAt: timestamp({ withTimezone: true, mode: "string" }).defaultNow(),
    revokedAt: timestamp({ withTimezone: true, mode: "string" }),
  },
  (table) => [
    foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
      name: "refreshTokens_userId_fkey",
    }).onDelete("cascade"),
    unique("refreshTokens_tokenHash_key").on(table.tokenHash),
  ]
)
