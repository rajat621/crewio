import { TextField } from "@mui/material";

function Input(props) {
  return (
    <TextField
      {...props}
      sx={{
        "& .MuiOutlinedInput-root": {
          borderRadius: "8px",
          "& fieldset": { borderColor: "var(--border-input)" },
          "&:hover fieldset": { borderColor: "var(--border-input-hover)" },
          "&.Mui-focused fieldset": { borderColor: "var(--border-input-focus)" },
          "&.Mui-disabled fieldset": { borderColor: "var(--border-input)" },
        },
        ...props.sx,
      }}
    />
  );
}

export default Input;
