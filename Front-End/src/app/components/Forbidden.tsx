import { Link } from "react-router";

export function Forbidden() {
  return (
    <div className="max-w-xl mx-auto bg-white rounded-xl border border-gray-200 p-8 text-center">
      <h1 className="mb-3">Access denied</h1>
      <p className="text-gray-600 mb-6">You don&apos;t have permission to open this page.</p>
      <Link to="/" className="inline-flex items-center px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
        Go to dashboard
      </Link>
    </div>
  );
}
