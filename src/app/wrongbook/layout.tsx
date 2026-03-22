import AuthGuard from "@/components/AuthGuard";

export default function WrongBookLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AuthGuard>{children}</AuthGuard>;
}
