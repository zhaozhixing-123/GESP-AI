import AuthGuard from "@/components/AuthGuard";

export default function ProblemsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthGuard>{children}</AuthGuard>;
}
