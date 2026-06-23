import type { ReactNode } from "react";
import Link from "next/link";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <header className="border-b border-gray-800 px-6 py-3 flex items-center gap-4">
        <span className="font-bold text-indigo-400">QA Sprint Board</span>
        <span className="text-gray-500 text-sm">Admin</span>
        <nav className="ml-auto flex gap-4 text-sm">
          <Link href="/admin" className="text-gray-400 hover:text-white">Дашборд</Link>
          <Link href="/admin/epics" className="text-gray-400 hover:text-white">Эпики</Link>
          <Link href="/admin/sprints" className="text-gray-400 hover:text-white">Спринты</Link>
          <Link href="/" className="text-gray-400 hover:text-white">← Доска</Link>
        </nav>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
