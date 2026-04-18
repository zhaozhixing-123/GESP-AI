"use client";

import { FocusProvider } from "./FocusTracker";
import PageViewTracker from "./PageViewTracker";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <FocusProvider>
      <PageViewTracker />
      {children}
    </FocusProvider>
  );
}
