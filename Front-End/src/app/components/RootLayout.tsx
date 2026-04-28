import { Outlet } from 'react-router';
import { AuthProvider } from '../context/AuthContext';

export function RootLayout() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}
