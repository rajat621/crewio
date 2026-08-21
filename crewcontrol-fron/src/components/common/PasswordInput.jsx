import { useState } from 'react'
import Visibility from '@mui/icons-material/Visibility'
import VisibilityOff from '@mui/icons-material/VisibilityOff'

// Matches the existing .form-group markup/style in auth.css exactly, with
// an eye-toggle button added inside the input. Shared by SignIn, SignUp,
// and the Forgot Password flow so all password fields in the app behave
// and look identical.
export default function PasswordInput({
	label,
	required,
	name,
	value,
	onChange,
	placeholder = 'Enter your password',
	disabled,
	error,
	autoComplete,
}) {
	const [visible, setVisible] = useState(false)

	return (
		<div className="form-group">
			{label && (
				<label htmlFor={name}>
					{label}
					{required && <span>*</span>}
				</label>
			)}
			<div style={{ position: 'relative' }}>
				<input
					id={name}
					type={visible ? 'text' : 'password'}
					name={name}
					placeholder={placeholder}
					value={value}
					onChange={onChange}
					disabled={disabled}
					autoComplete={autoComplete}
					className={error ? 'input-error' : ''}
					style={{ paddingRight: 44 }}
				/>
				<button
					type="button"
					onClick={() => setVisible((v) => !v)}
					disabled={disabled}
					aria-label={visible ? 'Hide password' : 'Show password'}
					style={{
						position: 'absolute',
						right: 10,
						top: '50%',
						transform: 'translateY(-50%)',
						background: 'none',
						border: 'none',
						padding: 4,
						margin: 0,
						display: 'flex',
						alignItems: 'center',
						justifyContent: 'center',
						cursor: disabled ? 'not-allowed' : 'pointer',
						color: '#9ca3af',
					}}
				>
					{visible ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
				</button>
			</div>
			{error && <p className="field-error">{error}</p>}
		</div>
	)
}
