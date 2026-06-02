import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const smtpPort = Number(env.SMTP_PORT || 587);

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: smtpPort,
  secure: smtpPort === 465,
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 15000,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

export const sendOtpEmail = async (email, otp) => {
  try {
    const mailOptions = {
      from: `${env.SMTP_FROM_NAME} <${env.SMTP_FROM_EMAIL}>`,
      to: email,
      subject: 'Your OTP for CrewControl',
      html: `
        <h2>Email Verification</h2>
        <p>Your OTP is: <strong>${otp}</strong></p>
        <p>This OTP will expire in 10 minutes.</p>
      `,
    };

    await transporter.sendMail(mailOptions);
    console.log(`OTP sent to ${email}`);
  } catch (error) {
    console.error('Error sending OTP email:', error);
    throw error;
  }
};

export default sendOtpEmail;
