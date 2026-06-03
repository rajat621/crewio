import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

const verifyResendConfig = async () => {
  try {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not set');
    }

    if (!process.env.RESEND_FROM_EMAIL) {
      throw new Error('RESEND_FROM_EMAIL is not set');
    }

    console.log('Resend email configured (from=' + process.env.RESEND_FROM_EMAIL + ')');
  } catch (error) {
    console.error('Resend configuration error:', error.message);
  }
};

verifyResendConfig();

export const sendOtpEmail = async (email, otp) => {
  try {
    const from = process.env.RESEND_FROM_EMAIL;
    if (!from) {
      throw new Error('RESEND_FROM_EMAIL is not set');
    }

    const response = await resend.emails.send({
      from,
      to: [email],
      subject: 'Your OTP for CrewControl',
      html:
        '<h2>Email Verification</h2>' +
        '<p>Your OTP is: <strong>' + otp + '</strong></p>' +
        '<p>This OTP will expire in 10 minutes.</p>',
    });

    if (response?.error) {
      throw new Error(response.error.message || 'Resend email send failed');
    }

    console.log('OTP sent to ' + email);
  } catch (error) {
    console.error('Error sending OTP email via Resend:', {
      message: error?.message,
      name: error?.name,
      stack: error?.stack,
    });
    throw error;
  }
};

export default sendOtpEmail;
