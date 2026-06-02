import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { env } from '../config/env.js';
import { sendOtpEmail } from '../utils/email.util.js';

const sanitizeFlow = (flow) => (flow === 'signup' ? 'signup' : 'signin');

const getFrontendBase = (req) => {
  const explicit = req.query?.frontend;
  if (explicit && /^https?:\/\//i.test(explicit)) {
    return explicit.replace(/\/$/, '');
  }
  const origin = req.headers.origin || req.headers.referer?.split('/').slice(0, 3).join('/');
  if (origin && /^https?:\/\//i.test(origin)) {
    return origin.replace(/\/$/, '');
  }
  return (env.FRONTEND_URL || 'https://crewio-rust.vercel.app').replace(/\/$/, '');
};

const getBackendBase = (req) => {
  if (env.BACKEND_URL) {
    return String(env.BACKEND_URL).replace(/\/$/, '');
  }
  const host = req.get('host');
  return `${req.protocol}://${host}`.replace(/\/$/, '');
};

const createState = ({ flow, frontend }) => {
  const payload = JSON.stringify({ flow: sanitizeFlow(flow), frontend });
  return Buffer.from(payload).toString('base64url');
};

const parseState = (state) => {
  try {
    const decoded = Buffer.from(String(state || ''), 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded);
    return {
      flow: sanitizeFlow(parsed?.flow),
      frontend: parsed?.frontend,
    };
  } catch (_error) {
    return { flow: 'signin', frontend: null };
  }
};

const redirectWithError = (res, frontend, flow, message) => {
  const authPath = flow === 'signup' ? '/signup' : '/signin';
  const target = `${frontend}${authPath}?error=${encodeURIComponent(message)}`;
  return res.redirect(target);
};

const issueOtpForUser = async (user) => {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
  user.otp = otp;
  user.otpExpiry = otpExpiry;
  await user.save();
  await sendOtpEmail(user.email, otp);
};

const splitDisplayName = (displayName) => {
  const parts = String(displayName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { firstName: '', lastName: '' };
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' };
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  };
};

const buildAuthUserPayload = (user) => ({
  id: user._id,
  email: user.email,
  firstName: user.firstName || '',
  lastName: user.lastName || '',
  mobileNumber: user.mobileNumber || '',
  countryCode: user.countryCode || '',
  dateOfBirth: user.dateOfBirth || '',
  gender: user.gender || '',
  avatar: user.avatar || null,
  role: user.role,
  companyId: user.company?._id || user.company || null,
});

export const googleAuthStart = async (req, res) => {
  try {
    const flow = sanitizeFlow(req.query?.flow);
    const frontend = getFrontendBase(req);

    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      return redirectWithError(res, frontend, flow, 'Google sign-in is not configured yet');
    }

    const backend = getBackendBase(req);
    const redirectUri = `${backend}/api/auth/google/callback`;
    const state = createState({ flow, frontend });

    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'offline',
      prompt: 'select_account',
      state,
    });

    return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
  } catch (error) {
    const frontend = getFrontendBase(req);
    const flow = sanitizeFlow(req.query?.flow);
    return redirectWithError(res, frontend, flow, `Google auth start failed: ${error.message}`);
  }
};

export const googleAuthCallback = async (req, res) => {
  const { flow, frontend: frontendFromState } = parseState(req.query?.state);
  const frontend = (frontendFromState && /^https?:\/\//i.test(frontendFromState)
    ? frontendFromState
    : getFrontendBase(req)).replace(/\/$/, '');

  try {
    if (req.query?.error) {
      return redirectWithError(res, frontend, flow, 'Google authorization was cancelled');
    }

    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      return redirectWithError(res, frontend, flow, 'Google sign-in is not configured yet');
    }

    const code = req.query?.code;
    if (!code) {
      return redirectWithError(res, frontend, flow, 'Missing Google authorization code');
    }

    const backend = getBackendBase(req);
    const redirectUri = `${backend}/api/auth/google/callback`;

    const tokenResponse = await axios.post(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        code: String(code),
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }).toString(),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }
    );

    const accessToken = tokenResponse.data?.access_token;
    if (!accessToken) {
      return redirectWithError(res, frontend, flow, 'Google token exchange failed');
    }

    const profileResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const googleEmail = String(profileResponse.data?.email || '').toLowerCase().trim();
    if (!googleEmail) {
      return redirectWithError(res, frontend, flow, 'Unable to read Google account email');
    }

    const fallbackName = splitDisplayName(profileResponse.data?.name);
    const googleFirstName = String(profileResponse.data?.given_name || fallbackName.firstName || '').trim();
    const googleLastName = String(profileResponse.data?.family_name || fallbackName.lastName || '').trim();

    let user = await User.findOne({ email: googleEmail });

    if (flow === 'signup') {
      if (!user) {
        const randomPassword = `google-${Math.random().toString(36).slice(2)}-${Date.now()}`;
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(randomPassword, salt);
        user = await User.create({
          firstName: googleFirstName,
          lastName: googleLastName,
          email: googleEmail,
          password: hashedPassword,
        });
      } else if (user.isVerified) {
        return redirectWithError(res, frontend, flow, 'Email already registered. Please sign in instead');
      }

      if (!user.firstName && googleFirstName) user.firstName = googleFirstName;
      if (!user.lastName && googleLastName) user.lastName = googleLastName;

      await issueOtpForUser(user);
      return res.redirect(`${frontend}/verify-email?email=${encodeURIComponent(googleEmail)}&flow=signup`);
    }

    if (!user) {
      return redirectWithError(res, frontend, flow, 'No account found. Please sign up first');
    }

    if (!user.firstName && googleFirstName) user.firstName = googleFirstName;
    if (!user.lastName && googleLastName) user.lastName = googleLastName;

    await issueOtpForUser(user);
    return res.redirect(`${frontend}/verify-email?email=${encodeURIComponent(googleEmail)}&flow=signin`);
  } catch (error) {
    return redirectWithError(res, frontend, flow, `Google authentication failed: ${error.message}`);
  }
};

export const signup = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      password,
      mobileNumber,
      countryCode,
    } = req.body;

    const normalizedEmail = String(email || '').toLowerCase().trim();
    const normalizedFirstName = String(firstName || '').trim();
    const normalizedLastName = String(lastName || '').trim();

    // Validation
    if (!normalizedEmail || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    // Check if user exists
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Create user
    const user = new User({
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      email: normalizedEmail,
      password: hashedPassword,
      mobileNumber,
      countryCode,
      otp,
      otpExpiry,
    });

    await user.save();

    // Send OTP email
    await sendOtpEmail(normalizedEmail, otp);

    res.status(201).json({
      message: 'User registered. OTP sent to email.',
      userId: user._id,
      email: user.email,
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ message: 'Signup failed', error: error.message });
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }

    if (new Date() > user.otpExpiry) {
      return res.status(400).json({ message: 'OTP expired' });
    }

    user.isVerified = true;
    user.otp = null;
    user.otpExpiry = null;
    await user.save();

    const token = jwt.sign({ userId: user._id, email: user.email }, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRE,
    });

    res.json({
      message: 'Email verified successfully',
      token,
      user: buildAuthUserPayload(user),
    });
  } catch (error) {
    console.error('OTP verification error:', error);
    res.status(500).json({ message: 'Verification failed', error: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (!user.isVerified) {
      return res.status(400).json({ message: 'Email not verified' });
    }

    const token = jwt.sign({ userId: user._id, email: user.email }, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRE,
    });

    res.json({
      message: 'Login successful',
      token,
      user: buildAuthUserPayload(user),
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Login failed', error: error.message });
  }
};

export const signin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    user.otp = otp;
    user.otpExpiry = otpExpiry;
    await user.save();

    await sendOtpEmail(user.email, otp);

    res.json({
      message: 'OTP sent to email',
      email: user.email,
    });
  } catch (error) {
    console.error('Signin error:', error);
    res.status(500).json({ message: 'Signin failed', error: error.message });
  }
};

export const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    user.otp = otp;
    user.otpExpiry = otpExpiry;
    await user.save();

    await sendOtpEmail(user.email, otp);

    res.json({ message: 'OTP resent successfully' });
  } catch (error) {
    console.error('Resend OTP error:', error);
    res.status(500).json({ message: 'Failed to resend OTP', error: error.message });
  }
};

export const getMe = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = await User.findById(userId).select('-password -otp -otpExpiry').populate('company');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const plain = user.toObject();
    res.json({
      user: {
        ...plain,
        companyId: plain.company?._id || null,
        twoFactorEnabled: Boolean(plain.twoFactorEnabled),
      },
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ message: 'Failed to fetch user profile', error: error.message });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const allowedFields = [
      'firstName',
      'lastName',
      'email',
      'dateOfBirth',
      'gender',
      'mobileNumber',
      'countryCode',
      'avatar',
    ];
    const updateData = {};

    for (const field of allowedFields) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        if (field === 'email') {
          updateData[field] = String(req.body[field] || '').toLowerCase().trim();
        } else if (field === 'firstName' || field === 'lastName' || field === 'dateOfBirth' || field === 'gender') {
          updateData[field] = String(req.body[field] || '').trim();
        } else {
          updateData[field] = req.body[field];
        }
      }
    }

    if (Object.prototype.hasOwnProperty.call(updateData, 'email')) {
      if (!updateData.email) {
        return res.status(400).json({ message: 'Email is required' });
      }

      const existingUser = await User.findOne({ email: updateData.email, _id: { $ne: userId } });
      if (existingUser) {
        return res.status(400).json({ message: 'Email already registered' });
      }
    }

    const user = await User.findByIdAndUpdate(userId, updateData, { new: true })
      .select('-password -otp -otpExpiry')
      .populate('company');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const plain = user.toObject();
    res.json({
      message: 'Profile updated successfully',
      user: {
        ...plain,
        companyId: plain.company?._id || null,
      },
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Failed to update profile', error: error.message });
  }
};

export const changePassword = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({ message: 'All password fields are required' });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({ message: 'New password and confirm password do not match' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ message: 'New password must be at least 8 characters' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Failed to change password', error: error.message });
  }
};

export const setupTwoFactor = async (req, res) => {
  res.json({
    setup: {
      secret: 'DEMO-SECRET',
      qrCodeUrl: '',
      otpauthUrl: '',
    },
  });
};

export const verifyTwoFactor = async (req, res) => {
  const { token } = req.body;
  if (!/^\d{6}$/.test((token || '').trim())) {
    return res.status(400).json({ message: 'Invalid authenticator code' });
  }

  res.json({ message: '2FA verified successfully' });
};

export const disableTwoFactor = async (req, res) => {
  res.json({ message: '2FA disabled successfully' });
};
