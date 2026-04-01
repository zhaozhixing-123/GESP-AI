"use client";

import { FocusProvider } from "./FocusTracker";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <FocusProvider>
      {children}
    </FocusProvider>
  );
}
