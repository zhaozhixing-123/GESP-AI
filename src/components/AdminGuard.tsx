"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/");
      return;
    }

    // 向服务端验证当前用户是否是 admin
    fetch("/api/auth/me", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then((data) => {
        if (data.user?.role === "admin") {
          setChecked(true);
        } else {
          router.push("/problems");
        }
      })
      .catch(() => {
        router.push("/");
      });
  }, [router]);

  if (!checked) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">验证权限...</p>
      </div>
    );
  }

  return <>{children}</>;
}
