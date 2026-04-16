import React from "react";

export default function Spinner({ text = "Loading..." }: { text?: string }) {
  return (
    <div className="spinner-container">
      <div className="spinner" />
      <span>{text}</span>
    </div>
  );
}
