
import { useEffect, useState } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import { authApi } from '../api/auth'
import '../styles/auth.css'
import logo from '../assets/crewio_logo.png'

export default function SignIn() {
	const navigate = useNavigate()
	const [searchParams] = useSearchParams()

	const [email, setEmail] = useState('')
	const [password, setPassword] = useState('')
	const [rememberMe, setRememberMe] = useState(false)
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState(null)

	useEffect(() => {
		const incomingError = searchParams.get('error')
		if (incomingError) {
			setError(incomingError)
		}
	}, [searchParams])

	const handleSubmit = async (e) => {
		e.preventDefault()
		setError(null)

		if (!email || !password) {
			setError('Please enter email and password')
			return
		}

		setLoading(true)
		try {
			await authApi.signin(email, password)
			navigate(`/verify-email?email=${encodeURIComponent(email)}&flow=signin`)
		} catch (err) {
			setError(err.response?.data?.message || 'Sign in failed. Please try again.')
		} finally {
			setLoading(false)
		}
	}

	return (
		<div className="auth-wrapper">

			{/* TOP-LEFT LOGO */}
			<div className="brand">
				<img src={logo} alt="Crewio logo" />
			</div>

			{/* CENTERED CARD */}
			<div className="auth-card">

				{/* HEADING */}
				<h2>Let's get work running smoothly</h2>
				<p className="subtitle">Sign in to continue managing your workforce.</p>

				{/* ERROR */}
				{error && (
					<p style={{ color: 'red', fontSize: 13, marginBottom: 16 }}>{error}</p>
				)}

				<form onSubmit={handleSubmit}>

					{/* EMAIL */}
					<div className="form-group">
						<label>Email<span>*</span></label>
						<input
							type="email"
							placeholder="Enter your Email"
							value={email}
							onChange={e => setEmail(e.target.value)}
							disabled={loading}
						/>
					</div>

					{/* PASSWORD */}
					<div className="form-group">
						<label>Password<span>*</span></label>
						<input
							type="password"
							placeholder="Enter your password"
							value={password}
							onChange={e => setPassword(e.target.value)}
							disabled={loading}
						/>
					</div>

					{/* REMEMBER ME + FORGOT PASSWORD */}
					<div className="form-row">
						<label className="checkbox">
							<input
								type="checkbox"
								checked={rememberMe}
								onChange={e => setRememberMe(e.target.checked)}
								disabled={loading}
							/>
							Remember Me
						</label>
						<Link to="/forgot-password" className="link">Forgot Password?</Link>
					</div>

					{/* SIGN IN BUTTON */}
					<button type="submit" className="btn-primary" disabled={loading}>
						{loading ? 'Signing In...' : 'Sign In'}
					</button>

					{/* GOOGLE BUTTON */}
					<button
						type="button"
						className="btn-google"
						disabled={loading}
						onClick={() => {
							const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000'
							const frontend = encodeURIComponent(window.location.origin)
							window.location.href = `${apiBase}/api/auth/google?flow=signin&frontend=${frontend}`
						}}
					>
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none">
							<path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
							<path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
							<path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
							<path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
						</svg>
						Continue with Google
					</button>

				</form>

				{/* SIGN UP LINK */}
				<p className="footer-text">
					Don't have an account?{' '}
					<Link to="/signup" className="link">Sign Up</Link>
				</p>

			</div>
		</div>
	)
}
