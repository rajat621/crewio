import { useNavigate } from "react-router-dom";
import "../styles/auth.css";
import logo from "../assets/crewio_logo.png";

export default function OnboardingSuccess() {
  const navigate = useNavigate();

  const handleContinue = () => {
    navigate("/");
  };

  return (
    <div className="auth-wrapper onboarding-wrapper">
      <div className="brand"><img src={logo} alt="CrewControl logo" /></div>

      <div className="auth-card onboarding-card onboarding-success-card">
        <div className="success-icon-container">
          <svg
            className="success-icon"
            width="80"
            height="80"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
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

        <h2 className="success-title">Secure Save Confirmation!</h2>
        <p className="success-subtitle">
          Your information has been securely saved.
        </p>

        <button type="button" className="btn-primary success-continue-btn" onClick={handleContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}
