import React, { useState, useRef, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { authApi } from "../api/auth";
import { useAuth } from "../context/AuthContext";
import logo from "../assets/crewio_logo.png";
import '../styles/auth.css'

const VerifyEmail = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [searchParams] = useSearchParams();
  const email = searchParams.get("email") || "";
  const flow = searchParams.get("flow") === "signin" ? "signin" : "signup";
  
  const [otp, setOtp] = useState(Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [timeLeft, setTimeLeft] = useState(240); // 4 minutes
  const [rememberMe, setRememberMe] = useState(false);

  const inputsRef = useRef([]);

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 0) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);

  const handleChange = (value, index) => {
    if (!/^\d?$/.test(value)) return;

    const updatedOtp = [...otp];
    updatedOtp[index] = value;
    setOtp(updatedOtp);

    if (value && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (e, index) => {
    if (e.key !== "Backspace") return;

    e.preventDefault();
    const updatedOtp = [...otp];

    if (updatedOtp[index]) {
      updatedOtp[index] = "";
      setOtp(updatedOtp);
      return;
    }

    if (index > 0) {
      updatedOtp[index - 1] = "";
      setOtp(updatedOtp);
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handleVerify = async () => {
    setError(null);

    if (otp.some((digit) => digit === "")) {
      setError("Please enter the complete verification code");
      return;
    }

    try {
      setLoading(true);
      const otpCode = otp.join("");
      console.log('[auth-ui] otp.verify.request', { email, flow, otpLength: otpCode.length });
      const response = await authApi.verifyOtp(email, otpCode, rememberMe);
      const { token, user } = response.data;
      console.log('[auth-ui] otp.verify.response.success', { email, userId: user?.id || user?._id || null });
      login(token, user);
      if (flow === "signin") {
        navigate("/");
      } else {
        navigate("/onboarding/company-profile");
      }
    } catch (err) {
      console.error('[auth-ui] otp.verify.response.error', {
        email,
        status: err?.response?.status,
        message: err?.response?.data?.message || err?.message,
        error: err?.response?.data?.error,
      });
      setError(err.response?.data?.message || "Invalid OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    try {
      setLoading(true);
      console.log('[auth-ui] otp.resend.request', { email, flow });
      await authApi.resendOtp(email);
      console.log('[auth-ui] otp.resend.response.success', { email });
      setOtp(Array(6).fill(""));
      setTimeLeft(240);
      setError(null);
    } catch (err) {
      console.error('[auth-ui] otp.resend.response.error', {
        email,
        status: err?.response?.status,
        message: err?.response?.data?.message || err?.message,
        error: err?.response?.data?.error,
      });
      setError(err.response?.data?.message || err.response?.data?.error || "Failed to resend OTP. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="auth-wrapper">
      {/* LOGO */}
      <div className="brand"><img src={logo} alt="CrewControl logo" /></div>

      {/* CARD */}
      <div className="auth-card verify-email-card">
        {/* HEADING */}
        <h2 className="verify-title">Check your email</h2>

        {/* SUBHEADING */}
        <p className="subtitle verify-description">
          We've sent a confirmation code to <strong style={{ color: '#2b4eff' }}>{email}</strong> . It might take a moment to arrive.
        </p>

        {/* ERROR ALERT */}
        {error && (
          <div style={{ 
            backgroundColor: '#fee2e2', 
            color: '#dc2626', 
            padding: '10px', 
            borderRadius: '6px', 
            marginBottom: '20px',
            fontSize: '14px'
          }}>
            {error}
          </div>
        )}

        {/* OTP INPUTS */}
        <div className="otp-box">
          {otp.map((digit, index) => (
            <input
              key={index}
              ref={(el) => {
                if (el) inputsRef.current[index] = el;
              }}
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(e.target.value, index)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              disabled={loading}
              className="otp-input"
              style={{
                borderColor: digit ? '#5B5BFF' : '#e0e0e0',
                cursor: loading ? 'not-allowed' : 'text'
              }}
            />
          ))}
        </div>

        {/* RESEND TEXT */}
        <div className={`verify-timer ${timeLeft < 30 ? 'urgent' : ''}`}>
          <button
            type="button"
            onClick={handleResendOtp}
            className="verify-resend-button"
            disabled={loading || timeLeft > 0}
          >
            {timeLeft > 0 ? `Resend OTP in ${formatTime(timeLeft)}s` : 'Resend OTP'}
          </button>
        </div>

        {/* REMEMBER ME CHECKBOX */}
        <div style={{ marginBottom: '20px', marginTop: '16px' }}>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              disabled={loading}
            />
            Remember Me
          </label>
        </div>

        {/* VERIFY BUTTON */}
        <button
          onClick={handleVerify}
          disabled={loading}
          className="btn-primary verify-btn"
        >
          {loading ? 'Verifying...' : 'Verify'}
        </button>

        {/* SIGN IN LINK */}
        <p className="footer-text verify-footer-text">
          Already have an account? <Link to="/signin" className="link">Sign In</Link>
        </p>
      </div>
    </div>
  );
};

export default VerifyEmail;
