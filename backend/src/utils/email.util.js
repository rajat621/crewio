import { Resend } from 'resend';
import { env } from '../config/env.js';

const resend = new Resend(env.RESEND_API_KEY);

export const sendOtpEmail = async (email, otp) => {
  try {
    const response = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: email,
      subject: 'Your OTP for CrewControl',
      html: `
        <h2>Email Verification</h2>
        <p>Your OTP is: <strong>${otp}</strong></p>
        <p>This OTP will expire in 10 minutes.</p>
      `,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    console.log(`OTP sent to ${email}`);
  } catch (error) {
    console.error('Error sending OTP email:', error);
    throw error;
  }
};

export const sendPasswordResetOtpEmail = async (email, otp) => {
  try {
    const response = await resend.emails.send({
      from: env.RESEND_FROM_EMAIL,
      to: email,
      subject: 'Password Reset Code for CrewControl',
      html: `
        <h2>Password Reset</h2>
        <p>We received a request to reset your password. Your verification code is: <strong>${otp}</strong></p>
        <p>This code will expire in 10 minutes.</p>
        <p>If you did not request a password reset, you can safely ignore this email.</p>
      `,
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    console.log(`Password reset OTP sent to ${email}`);
  } catch (error) {
    console.error('Error sending password reset OTP email:', error);
    throw error;
  }
};

export default sendOtpEmail;
