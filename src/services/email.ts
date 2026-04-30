import * as nodemailer from 'nodemailer'
import type { Config } from '../config'

export type TestEmail = {
  to: string
  code: string
}

export const testEmailOutbox: TestEmail[] = []

export async function sendPasswordResetCode(config: Config, to: string, code: string) {
  if (config.nodeEnv === 'test') {
    testEmailOutbox.push({ to, code })
    return
  }

  const transport = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
  })

  await transport.sendMail({
    from: config.smtp.from,
    to,
    subject: 'FinU password reset code',
    text: `Your FinU password reset code is ${code}. It expires in 60 minutes.`,
  })
}
