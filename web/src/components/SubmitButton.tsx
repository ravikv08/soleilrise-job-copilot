"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  pendingLabel,
  className = "btn",
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button className={className} type="submit" disabled={pending}>
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}
