"use client";

import FocusTracker from "./FocusTracker";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <FocusTracker />
      {children}
    </>
  );
}
