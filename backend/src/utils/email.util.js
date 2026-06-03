import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const smtpPort = Number(env.SMTP_PORT || 587);
const smtpSecure = smtpPort === 465;

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: smtpPort,
  secure: smtpSecure,
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 15000,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

transporter
  .verify()
  .then(() => {
    console.log(`SMTP transporter verified (host=${env.SMTP_HOST}, port=${smtpPort}, secure=${smtpSecure})`);
  })
  .catch((error) => {
    console.error('SMTP transporter verify failed:', error.message);
  });

export const sendOtpEmail = async (email, otp) => {
  const fromEmail = env.SMTP_FROM_EMAIL || env.SMTP_USER;
  const mailOptions = {
    from: `${env.SMTP_FROM_NAME} <${fromEmail}>`,
    to: email,
    subject: 'Your OTP for CrewControl',
    html: `
      <h2>Email Verification</h2>
      <p>Your OTP is: <strong>${otp}</strong></p>
      <p>This OTP will expire in 10 minutes.</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`OTP sent to ${email}`);
  } catch (error) {
    console.error('Error sending OTP email:', error);
    throw error;
  }
};

export default sendOtpEmail;
