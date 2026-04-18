import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import ClientLayout from "@/components/ClientLayout";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GESP.AI - 智能刷题平台",
  description: "GESP全国青少年编程等级考试智能刷题平台",
  other: {
    "google-fonts": "preconnect",
  },
};

// CSP nonce 需要逐请求注入到脚本标签，必须禁用静态/ISR/PPR 预渲染
export const dynamic = "force-dynamic";

/** 落地页使用的中文衬线/无衬线字体 */
const notoFontsLink = `https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;700&family=Noto+Serif+SC:wght@600;700;900&display=swap`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="zh-CN"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href={notoFontsLink} rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col bg-gray-50">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  );
}
