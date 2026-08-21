import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '../api/auth'
import PasswordInput from '../components/common/PasswordInput'
import '../styles/auth.css'
import logo from '../assets/crewio_logo.svg'

const STEP = {
	EMAIL: 'EMAIL',
	OTP: 'OTP',
	NEW_PASSWORD: 'NEW_PASSWORD',
	SUCCESS: 'SUCCESS',
}

export default function ForgotPassword() {
	const navigate = useNavigate()

	const [step, setStep] = useState(STEP.EMAIL)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState(null)

	const [email, setEmail] = useState('')
	const [otp, setOtp] = useState(Array(6).fill(''))
	const [resendTimeLeft, setResendTimeLeft] = useState(0)
	const [resetToken, setResetToken] = useState(null)

	const [newPassword, setNewPassword] = useState('')
	const [confirmPassword, setConfirmPassword] = useState('')
	const [fieldErrors, setFieldErrors] = useState({})

	const inputsRef = useRef([])
	const resendTimerRef = useRef(null)

	const startResendCooldown = () => {
		setResendTimeLeft(240)
		if (resendTimerRef.current) clearInterval(resendTimerRef.current)
		resendTimerRef.current = setInterval(() => {
			setResendTimeLeft(prev => {
				if (prev <= 1) {
					clearInterval(resendTimerRef.current)
					return 0
				}
				return prev - 1
			})
		}, 1000)
	}

	const formatTime = (seconds) => {
		const mins = Math.floor(seconds / 60)
		const secs = seconds % 60
		return `${mins}:${secs.toString().padStart(2, '0')}`
	}

	// STEP 1: EMAIL --------------------------------------------------------
	const isValidEmail = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

	const handleEmailSubmit = async (e) => {
		e.preventDefault()
		setError(null)

		if (!email) {
			setError('Please enter your email address')
			return
		}
		if (!isValidEmail(email)) {
			setError('Please enter a valid email address')
			return
		}

		setLoading(true)
		try {
			await authApi.forgotPassword(email)
			setOtp(Array(6).fill(''))
			startResendCooldown()
			setStep(STEP.OTP)
		} catch (err) {
			setError(err.response?.data?.message || 'Something went wrong. Please try again.')
		} finally {
			setLoading(false)
		}
	}

	// STEP 2: OTP ------------------------------------------------------------
	const handleOtpChange = (value, index) => {
		if (!/^\d?$/.test(value)) return
		const updated = [...otp]
		updated[index] = value
		setOtp(updated)
		if (value && index < 5) {
			inputsRef.current[index + 1]?.focus()
		}
	}

	const handleOtpKeyDown = (e, index) => {
		if (e.key !== 'Backspace') return
		e.preventDefault()
		const updated = [...otp]
		if (updated[index]) {
			updated[index] = ''
			setOtp(updated)
			return
		}
		if (index > 0) {
			updated[index - 1] = ''
			setOtp(updated)
			inputsRef.current[index - 1]?.focus()
		}
	}

	const handleOtpVerify = async () => {
		setError(null)
		if (otp.some(d => d === '')) {
			setError('Please enter the complete verification code')
			return
		}

		setLoading(true)
		try {
			const otpCode = otp.join('')
			const response = await authApi.verifyForgotPasswordOtp(email, otpCode)
			setResetToken(response.data.resetToken)
			setStep(STEP.NEW_PASSWORD)
		} catch (err) {
			setError(err.response?.data?.message || 'Invalid code. Please try again.')
		} finally {
			setLoading(false)
		}
	}

	const handleResendOtp = async () => {
		if (TimeLeft > 0 || loading) return
		setError(null)
		setLoading(true)
		try {
			await authApi.forgotPassword(email)
			setOtp(Array(6).fill(''))
			startResendCooldown()
		} catch (err) {
			setError(err.response?.data?.message || 'Failed to resend code. Please try again.')
		} finally {
			setLoading(false)
		}
	}

	// STEP 3: NEW PASSWORD ----------------------------------------------------
	const handlePasswordSubmit = async (e) => {
		e.preventDefault()
		setError(null)

		const errors = {}
		if (!newPassword) errors.newPassword = 'Password is required'
		else if (newPassword.length < 8) errors.newPassword = 'Password must be at least 8 characters'
		if (!confirmPassword) errors.confirmPassword = 'Please confirm your password'
		else if (newPassword && confirmPassword !== newPassword) errors.confirmPassword = 'Passwords do not match'

		setFieldErrors(errors)
		if (Object.keys(errors).length > 0) return

		setLoading(true)
		try {
			await authApi.resetPassword(email, resetToken, newPassword, confirmPassword)
			setStep(STEP.SUCCESS)
		} catch (err) {
			setError(err.response?.data?.message || 'Failed to reset password. Please try again.')
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className="auth-wrapper">
			<div className="brand">
				<img src={logo} alt="Crewio logo" />
			</div>

			{step === STEP.EMAIL && (
				<div className="auth-card">
					<h2>Forgot Password?</h2>
					<p className="subtitle">
						Enter your registered email address and we'll send you a verification code.
					</p>

					{error && (
						<p style={{ color: 'red', fontSize: 13, marginBottom: 16 }}>{error}</p>
					)}

					<form onSubmit={handleEmailSubmit}>
						<div className="form-group">
							<label htmlFor="fp-email">Email<span>*</span></label>
							<input
								id="fp-email"
								type="email"
								placeholder="Enter your Email"
								value={email}
								onChange={e => setEmail(e.target.value)}
								disabled={loading}
								autoComplete="email"
							/>
						</div>

						<button type="submit" className="btn-primary" disabled={loading}>
							{loading ? 'Sending...' : 'Continue'}
						</button>
					</form>

					<p className="footer-text">
						Remembered your password?{' '}
						<Link to="/signin" className="link">Sign In</Link>
					</p>
				</div>
			)}

			{step === STEP.OTP && (
				<div className="auth-card verify-email-card">
					<h2 className="verify-title">Verify Your Email</h2>
					<p className="subtitle verify-description">
						Enter the verification code sent to{' '}
						<strong style={{ color: '#2b4eff' }}>{email}</strong>.
					</p>

					{error && (
						<div style={{
							backgroundColor: '#fee2e2',
							color: '#dc2626',
							padding: '10px',
							borderRadius: '6px',
							marginBottom: '20px',
							fontSize: '14px',
						}}>
							{error}
						</div>
					)}

					<div className="otp-box">
						{otp.map((digit, index) => (
							<input
								key={index}
								ref={el => { if (el) inputsRef.current[index] = el }}
								maxLength={1}
								value={digit}
								onChange={e => handleOtpChange(e.target.value, index)}
								onKeyDown={e => handleOtpKeyDown(e, index)}
								disabled={loading}
								className="otp-input"
								style={{
									borderColor: digit ? '#5B5BFF' : '#e0e0e0',
									cursor: loading ? 'not-allowed' : 'text',
								}}
							/>
						))}
					</div>

					<div className={`verify-timer ${resendTimeLeft < 30 ? 'urgent' : ''}`}>
						<button
							type="button"
							onClick={handleResendOtp}
							className="verify-resend-button"
							disabled={loading || resendTimeLeft > 0}
						>
							{resendTimeLeft > 0 ? `Resend code in ${formatTime(resendTimeLeft)}s` : 'Resend Code'}
						</button>
					</div>

					<button
						onClick={handleOtpVerify}
						disabled={loading}
						className="btn-primary verify-btn"
						style={{ marginTop: 16 }}
					>
						{loading ? 'Verifying...' : 'Verify'}
					</button>

					<p className="footer-text verify-footer-text">
						<Link to="/signin" className="link">Back to Sign In</Link>
					</p>
				</div>
			)}

			{step === STEP.NEW_PASSWORD && (
				<div className="auth-card">
					<h2>Create New Password</h2>
					<p className="subtitle">Enter a new password for your account.</p>

					{error && (
						<p style={{ color: 'red', fontSize: 13, marginBottom: 16 }}>{error}</p>
					)}

					<form onSubmit={handlePasswordSubmit}>
						<PasswordInput
							label="New Password"
							required
							name="newPassword"
							value={newPassword}
							onChange={e => setNewPassword(e.target.value)}
							disabled={loading}
							error={fieldErrors.newPassword}
							autoComplete="new-password"
						/>

						<PasswordInput
							label="Confirm Password"
							required
							name="confirmPassword"
							value={confirmPassword}
							onChange={e => setConfirmPassword(e.target.value)}
							disabled={loading}
							error={fieldErrors.confirmPassword}
							autoComplete="new-password"
						/>

						<button type="submit" className="btn-primary" disabled={loading}>
							{loading ? 'Resetting...' : 'Reset Password'}
						</button>
					</form>
				</div>
			)}

			{step === STEP.SUCCESS && (
				<div className="auth-card onboarding-card onboarding-success-card">
					<div className="success-icon-container">
						<svg className="success-icon" width="80" height="80" viewBox="0 0 24 24" fill="currentColor">
							<circle cx="12" cy="12" r="12" fill="#2b4eff" />
							<path
								d="M9 12.5l2 2 4-5"
								stroke="white"
								strokeWidth="2"
								fill="none"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</div>

					<h2 className="success-title">Password Reset Successful</h2>
					<p className="success-subtitle">Your password has been updated successfully.</p>

					<button
						type="button"
						className="btn-primary success-continue-btn"
						onClick={() => navigate('/signin')}
					>
						Back to Sign In
					</button>
				</div>
			)}
		</div>
	)
}
