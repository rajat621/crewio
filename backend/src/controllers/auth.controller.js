import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { env } from '../config/env.js';
import { sendOtpEmail } from '../utils/email.util.js';
import Company from '../models/Company.js';
import { generateTotpSecret, buildOtpAuthUrl, buildQrCodeUrl, verifyTotpToken } from '../utils/totp.util.js';

const logAuth = (stage, details = {}) => {
  console.log(`[auth] ${stage}`, details);
};

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
  return (env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
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
  const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  user.otp = otp;
  // Write only the new canonical field; keep legacy fields untouched
  user.otpExpiresAt = otpExpiresAt;
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
  onboardingCompleted: Boolean(user.onboardingCompleted || user.company?.onboardingCompleted),
});

const isOwnerRole = (role) => String(role || '').toUpperCase() === 'OWNER';

const buildOwnerToken = (user) => {
  const role = isOwnerRole(user.role) ? 'OWNER' : user.role;
  return jwt.sign(
    {
      userId: user._id,
      email: user.email,
      role,
      ownerId: user._id,
    },
    env.JWT_SECRET,
    { expiresIn: env.JWT_EXPIRE }
  );
};

const getStoredPasswordHash = (user) => user?.passwordHash || user?.password;

const ensureOwnerCompanyForUser = async (user) => {
  if (!user?._id) return null;

  const ownerId = user._id;
  let company = await Company.findOne({
    ownerId,
    companyRole: 'owner',
    isOwner: true,
  });

  if (!company) {
    company = await Company.create({
      owner: ownerId,
        createdBy: ownerId,
      ownerId,
      companyRole: 'owner',
      isOwner: true,
      name: '',
      companyLegalName: '',
      trn: '',
      websiteLink: '',
      address: '',
      city: '',
      nationality: '',
      contactEmail: '',
      mobileNumber: '',
      countryCode: '',
      onboardingCompleted: false,
    });
  }

  if (!user.company || String(user.company?._id || user.company) !== String(company._id)) {
    user.company = company._id;
  }

  const completed = Boolean(company.onboardingCompleted);
  if (user.onboardingCompleted !== completed) {
    user.onboardingCompleted = completed;
  }

  await user.save();
  user.company = company;
  return company;
};

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
          passwordHash: hashedPassword,
          role: 'OWNER',
        });
      } else if (user.isVerified || user.isEmailVerified) {
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
      logAuth('signup.user.exists', { email: normalizedEmail, userId: String(existingUser._id) });
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Hash password (store only in passwordHash)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Create user (do not write legacy fields `password`, `otpExpiry`, `isVerified`)
    const user = new User({
      firstName: normalizedFirstName,
      lastName: normalizedLastName,
      email: normalizedEmail,
      passwordHash: hashedPassword,
      mobileNumber,
      countryCode,
      role: 'OWNER',
      otp,
      otpExpiresAt: otpExpiry,
      isEmailVerified: false,
      onboardingCompleted: false,
    });

    await user.save();
    logAuth('signup.user.created', { email: normalizedEmail, userId: String(user._id) });

    // Send OTP email
    await sendOtpEmail(normalizedEmail, otp);

    res.status(201).json({
      message: 'User registered. OTP sent to email.',
      userId: user._id,
      email: user.email,
    });
    logAuth('signup.response.success', { email: normalizedEmail, status: 201 });
  } catch (error) {
    console.error('Signup error:', error);
    logAuth('signup.error', { message: error.message, code: error.code || null });
    if (error?.code === 11000 && error?.message?.includes('employeeId_1')) {
      return res.status(500).json({
        message: 'Signup temporarily unavailable due to a stale database index. Run the user index migration and retry.',
      });
    }
    res.status(500).json({ message: 'Signup failed', error: error.message });
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    logAuth('otp.verify.request', { email, otpLength: String(otp || '').length });

    if (!email || !otp) {
      return res.status(400).json({ message: 'Email and OTP are required' });
    }

    const normalizedEmail = String(email || '').toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(400).json({ message: 'User not found' });
    }

    if (user.otp !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }
    const otpExpiry = user.otpExpiresAt || user.otpExpiry;
    if (otpExpiry && new Date() > otpExpiry) {
      return res.status(400).json({ message: 'OTP expired' });
    }
    // Mark email verified using canonical flag; leave legacy `isVerified` untouched
    user.isEmailVerified = true;
    user.otp = null;
    user.otpExpiresAt = null;
    await ensureOwnerCompanyForUser(user);

    const token = buildOwnerToken(user);

    res.json({
      message: 'Email verified successfully',
      token,
      user: buildAuthUserPayload(user),
    });
    logAuth('otp.verify.success', { email: user.email, userId: String(user._id) });
  } catch (error) {
    console.error('OTP verification error:', error);
    logAuth('otp.verify.error', { message: error.message });
    res.status(500).json({ message: 'Verification failed', error: error.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: String(email || '').toLowerCase().trim() }).select('+password +passwordHash');
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const storedPassword = getStoredPasswordHash(user);
    const isPasswordValid = storedPassword ? await bcrypt.compare(password, storedPassword) : false;
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Use isEmailVerified as the source of truth
    if (!user.isEmailVerified) {
      return res.status(400).json({ message: 'Email not verified' });
    }

    await ensureOwnerCompanyForUser(user);
    const token = buildOwnerToken(user);

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
    logAuth('signin.request.received', { email: String(email || '').toLowerCase().trim(), hasPassword: Boolean(password) });

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password +passwordHash');
    if (!user) {
      logAuth('signin.user.notFound', { email: email.toLowerCase().trim() });
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const storedPassword = getStoredPasswordHash(user);
    const isPasswordValid = storedPassword ? await bcrypt.compare(password, storedPassword) : false;
    if (!isPasswordValid) {
      logAuth('signin.password.invalid', { email: user.email, userId: String(user._id) });
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    // Use isEmailVerified as source of truth
    if (!user.isEmailVerified) {
      return res.status(400).json({ message: 'Email not verified' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    user.otp = otp;
    // Write only canonical otp field
    user.otpExpiresAt = otpExpiry;
    await user.save();
    logAuth('signin.otp.generated', { email: user.email, userId: String(user._id) });

    try {
      logAuth('signin.otp.send.start', { email: user.email });
      await sendOtpEmail(user.email, otp);
      logAuth('signin.otp.send.success', { email: user.email });
    } catch (emailError) {
      logAuth('signin.otp.send.error', { email: user.email, message: emailError.message });
      user.otp = null;
      user.otpExpiresAt = null;
      await user.save();
      return res.status(502).json({
        message: 'Unable to send OTP email right now. Please try again shortly.',
        error: emailError.message,
      });
    }

    res.json({
      message: 'OTP sent to email',
      email: user.email,
    });
    logAuth('signin.response.success', { email: user.email, status: 200 });
  } catch (error) {
    console.error('Signin error:', error);
    logAuth('signin.error', { message: error.message });
    res.status(500).json({ message: 'Signin failed', error: error.message });
  }
};

export const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    logAuth('otp.resend.request', { email: String(email || '').toLowerCase().trim() });

    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      logAuth('otp.resend.user.notFound', { email: email.toLowerCase().trim() });
      return res.status(404).json({ message: 'User not found' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000);

    user.otp = otp;
    // Write only canonical otp field
    user.otpExpiresAt = otpExpiry;
    await user.save();
    logAuth('otp.resend.generated', { email: user.email, userId: String(user._id) });

    try {
      logAuth('otp.resend.send.start', { email: user.email });
      await sendOtpEmail(user.email, otp);
      logAuth('otp.resend.send.success', { email: user.email });
    } catch (emailError) {
      logAuth('otp.resend.send.error', { email: user.email, message: emailError.message });
      user.otp = null;
      user.otpExpiresAt = null; 
      await user.save();
      return res.status(502).json({
        message: 'Unable to send OTP email right now. Please try again shortly.',
        error: emailError.message,
      });
    }

    res.json({ message: 'OTP resent successfully' });
    logAuth('otp.resend.response.success', { email: user.email, status: 200 });
  } catch (error) {
    console.error('Resend OTP error:', error);
    logAuth('otp.resend.error', { message: error.message });
    res.status(500).json({ message: 'Failed to resend OTP', error: error.message });
  }
};

export const getMe = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = await User.findById(userId).select('-password -passwordHash -otp -otpExpiry -otpExpiresAt').populate('company');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (isOwnerRole(user.role)) {
      await ensureOwnerCompanyForUser(user);
    }

    const plain = user.toObject();
    const onboardingCompleted = Boolean(plain.onboardingCompleted || plain.company?.onboardingCompleted);
    res.json({
      user: {
        ...plain,
        companyId: plain.company?._id || null,
        onboardingCompleted,
        twoFactorEnabled: Boolean(plain.twoFactorEnabled),
      },
      onboardingCompleted,
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
      .select('-password -passwordHash -otp -otpExpiry -otpExpiresAt')
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

    const user = await User.findById(userId).select('+password +passwordHash');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const storedPassword = getStoredPasswordHash(user);
    const isPasswordValid = storedPassword ? await bcrypt.compare(currentPassword, storedPassword) : false;
    if (!isPasswordValid) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    // Only write canonical passwordHash; leave legacy `password` untouched
    user.passwordHash = hashedPassword;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: 'Failed to change password', error: error.message });
  }
};

export const setupTwoFactor = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const secret = generateTotpSecret();
    const otpauthUrl = buildOtpAuthUrl({ secret, accountName: user.email });
    const qrCodeUrl = buildQrCodeUrl(otpauthUrl);

    // Store as a pending secret; it only becomes the active secret once the
    // user proves possession of it via verifyTwoFactor.
    user.twoFactorTempSecret = secret;
    await user.save();

    res.json({
      setup: {
        secret,
        qrCodeUrl,
        otpauthUrl,
      },
    });
  } catch (error) {
    console.error('Setup 2FA error:', error);
    res.status(500).json({ message: 'Failed to start 2FA setup', error: error.message });
  }
};

export const verifyTwoFactor = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { token } = req.body;
    if (!/^\d{6}$/.test(String(token || '').trim())) {
      return res.status(400).json({ message: 'Invalid authenticator code' });
    }

    const user = await User.findById(userId).select('+twoFactorTempSecret +twoFactorSecret');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Support verifying against a freshly-generated pending secret (initial
    // setup) as well as the already-active secret (defensive fallback).
    const candidateSecret = user.twoFactorTempSecret || user.twoFactorSecret;
    if (!candidateSecret || !verifyTotpToken(candidateSecret, token)) {
      return res.status(400).json({ message: 'Invalid authenticator code' });
    }

    user.twoFactorSecret = candidateSecret;
    user.twoFactorTempSecret = undefined;
    user.twoFactorEnabled = true;
    await user.save();

    res.json({ message: '2FA verified successfully' });
  } catch (error) {
    console.error('Verify 2FA error:', error);
    res.status(500).json({ message: 'Failed to verify 2FA code', error: error.message });
  }
};

export const disableTwoFactor = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    user.twoFactorTempSecret = undefined;
    await user.save();

    res.json({ message: '2FA disabled successfully' });
  } catch (error) {
    console.error('Disable 2FA error:', error);
    res.status(500).json({ message: 'Failed to disable 2FA', error: error.message });
  }
};

export const deleteAccount = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    const { password } = req.body;

    const user = await User.findById(userId).select('+password +passwordHash');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Only require password confirmation for accounts that actually have a
    // usable password (skips the edge case of Google-only accounts where the
    // stored password is a random placeholder the user never set).
    const storedPassword = getStoredPasswordHash(user);
    if (storedPassword) {
      if (!password) {
        return res.status(400).json({ message: 'Password is required to delete your account' });
      }
      const isPasswordValid = await bcrypt.compare(password, storedPassword);
      if (!isPasswordValid) {
        return res.status(400).json({ message: 'Incorrect password' });
      }
    }

    const ownerId = user._id;

    // Best-effort cascade delete of everything scoped to this owner. Each
    // deletion is independent so a missing/unregistered model never blocks
    // account deletion.
    const { default: mongoose } = await import('mongoose');
    const modelsToClean = [
      'Employee',
      'Company',
      'Attendance',
      'AttendanceImport',
      'AuditLog',
      'Chat',
      'EmployeeDocument',
      'EmployeeLocation',
      'ExtractionJob',
      'File',
      'FileAsset',
      'FileRecord',
      'Invoice',
      'InvoiceAuditLog',
      'InvoiceCounter',
      'Notification',
      'OwnerCompany',
      'SalarySlip',
      'TemplateProfile',
      'WorkSession',
    ];

    for (const modelName of modelsToClean) {
      try {
        const Model = mongoose.models[modelName];
        if (!Model) continue;
        await Model.deleteMany({
          $or: [{ owner: ownerId }, { ownerId }, { createdBy: ownerId }],
        });
      } catch (cleanupError) {
        console.error(`Delete account cleanup failed for ${modelName}:`, cleanupError.message);
      }
    }

    await User.findByIdAndDelete(ownerId);

    res.json({ message: 'Account and all associated data deleted successfully' });
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ message: 'Failed to delete account', error: error.message });
  }
};


