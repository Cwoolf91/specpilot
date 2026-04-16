import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export default function Input({ label, id, ...props }: InputProps) {
  return (
    <div className="input-group">
      {label && <label htmlFor={id}>{label}</label>}
      <input id={id} className="input" {...props} />
    </div>
  );
}
