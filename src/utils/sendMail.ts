import nodemailer from "nodemailer"
import pug from "pug"
import { convert } from "html-to-text"
import { fileURLToPath } from "url"
import path from "path"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const createTransporter = () => {
  return nodemailer.createTransport({
    service: "Gmail",
    auth: {
      user: process.env.TRANSPORT_EMAIL,
      pass: process.env.TRANSPORT_PASSWORD,
    },
  })
}

async function sendTemplateEmail({
  email,
  subject,
  templateName,
  data,
}: {
  email: string
  subject: string
  templateName: string
  data: any
}) {
  try {
    const templatePath = path.join(__dirname, "..", "views", templateName)
    const html = pug.renderFile(templatePath, data)

    const transporter = createTransporter()
    const mailOptions = {
      from: `Trakio <${process.env.TRANSPORT_EMAIL}>`,
      to: email,
      subject,
      text: convert(html),
      html,
    }
    const info = await transporter.sendMail(mailOptions)
    return info
  } catch (error) {
    console.error(`Error sending ${templateName} email:`, error)
    throw error
  }
}

export const sendSignupEmail = async ({
  email,
  otp,
}: {
  email: string
  otp: string
}) => {
  return sendTemplateEmail({
    email,
    subject: "Verify your email address",
    templateName: "signup.pug",
    data: { otp },
  })
}

export const sendForgotPasswordEmail = async ({
  email,
  otp,
}: {
  email: string
  otp: string
}) => {
  return sendTemplateEmail({
    email,
    subject: "Password Reset Request",
    templateName: "forgotPassword.pug",
    data: { otp },
  })
}

export const sendSplitInviteEmail = async ({
  email,
  inviterName,
  description,
  appUrl,
}: {
  email: string
  inviterName: string
  description: string
  appUrl: string
}) => {
  const transporter = createTransporter()
  const html = `
    <div style="font-family: -apple-system, Segoe UI, Roboto, sans-serif; max-width: 480px; margin: 0 auto; color: #111;">
      <h2 style="color:#4F46E5;">${inviterName} added you to a shared expense on Trakio</h2>
      <p style="font-size:16px;">"${description}"</p>
      <p style="font-size:15px; color:#444;">Trakio is where friends split bills and settle up. Download the app to see what you owe and settle when you're ready.</p>
      <a href="${appUrl}" style="display:inline-block; margin-top:12px; background:#6366F1; color:#fff; padding:12px 20px; border-radius:10px; text-decoration:none; font-weight:600;">Open Trakio</a>
      <p style="font-size:12px; color:#999; margin-top:24px;">If you didn't expect this, you can ignore this email.</p>
    </div>`
  return transporter.sendMail({
    from: `Trakio <${process.env.TRANSPORT_EMAIL}>`,
    to: email,
    subject: `${inviterName} added you to a split on Trakio`,
    text: convert(html),
    html,
  })
}

export const sendVerificationEmail = async ({
  email,
  verificationCode,
}: {
  email: string
  verificationCode: string
}) => {
  const verificationUrl = `${process.env.BACKEND_URL}/api/auth/verifyemail/${verificationCode}`
  return sendTemplateEmail({
    email,
    subject: "Email Verification",
    templateName: "verificationCode.pug",
    data: { verificationUrl },
  })
}
