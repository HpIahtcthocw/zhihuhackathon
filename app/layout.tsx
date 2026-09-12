import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "岔路口 · 知乎围炉",
  description: "四位真实知乎答主，围炉讨论你一个人的困境",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
