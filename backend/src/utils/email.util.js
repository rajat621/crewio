// import nodemailer from 'nodemailer';
// import { env } from '../config/env.js';
// import { Resend } from 'resend';
// const resend = new Resend(env.RESEND_API_KEY);

// const verifyResendConfig = async () => {
//   try {
//     if (!env.RESEND_API_KEY) {
//       throw new Error('RESEND_API_KEY is not set');
//     }

//     if (!env.RESEND_FROM_EMAIL) {
//       throw new Error('RESEND_FROM_EMAIL is not set');
//     }

//     console.log('[email][resend] configured', { from: env.RESEND_FROM_EMAIL });
//   } catch (error) {
//     console.error('Resend configuration error:', error.message);
//   }
// };

// verifyResendConfig();

// export const sendOtpEmail = async (email, otp) => {
//   try {
//     const from = env.RESEND_FROM_EMAIL;
//     if (!from) {
//       throw new Error('RESEND_FROM_EMAIL is not set');
//     }

//     console.log('[email][resend][send.start]', {
//       to: email,
//       from,
//       subject: 'Your OTP for CrewControl',
//     });

//     const response = await resend.emails.send({
//       from,
//       to: [email],
//       subject: 'Your OTP for CrewControl',
//       html:
//         '<h2>Email Verification</h2>' +
//         '<p>Your OTP is: <strong>' + otp + '</strong></p>' +
//         '<p>This OTP will expire in 10 minutes.</p>',
//     });

//     if (response?.error) {
//       console.error('[email][resend][send.error]', response.error);
//       throw new Error(response.error.message || 'Resend email send failed');
//     }

//     console.log('[email][resend][send.success]', {
//       to: email,
//       responseId: response?.data?.id || null,
//     });
//   } catch (error) {
//     console.error('Error sending OTP email via Resend:', {
//       message: error?.message,
//       name: error?.name,
//       stack: error?.stack,
//     });
//     throw error;
//   }
// };

// export default sendOtpEmail;
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_PORT === 465,
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


