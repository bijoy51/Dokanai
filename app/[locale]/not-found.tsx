import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center p-8">
      <div className="text-center">
        <div className="text-5xl font-semibold">404</div>
        <p className="text-slate-500 mt-2">Page not found.</p>
        <Link href="/en" className="inline-block mt-4 px-4 py-2 bg-brand-600 text-white rounded-md text-sm">
          Go home
        </Link>
      </div>
    </div>
  );
}
