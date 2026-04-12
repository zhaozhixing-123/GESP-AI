export default function ProblemsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 题库列表对游客公开，不需要 AuthGuard
  // 题目详情页由 API 层（401/403）控制访问权限
  return <>{children}</>;
}
