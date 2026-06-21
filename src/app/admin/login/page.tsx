"use client";
import { useState } from "react";

export default function AdminLogin() {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (res.ok) {
      // Жёсткая навигация, а не router.push: иначе App Router отдаёт
      // закэшированный RSC-редирект на /admin/login (кука ещё не учтена в кэше).
      window.location.assign("/admin");
    } else {
      setError("Неверный токен");
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <form onSubmit={handleSubmit} className="bg-gray-900 p-8 rounded-xl w-80 space-y-4">
        <h1 className="text-white text-xl font-bold">QA Sprint Board Admin</h1>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Токен доступа"
          className="w-full bg-gray-800 text-white px-4 py-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {error && <p className="text-red-400 text-sm">{error}</p>}
        <button
          type="submit"
          className="w-full bg-indigo-600 hover:bg-indigo-500 text-white py-2 rounded-lg font-medium"
        >
          Войти
        </button>
      </form>
    </div>
  );
}
