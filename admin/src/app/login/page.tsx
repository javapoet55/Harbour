import { AdminLoginForm } from './admin-login-form';

// The Nexdo app lives on another domain; link to its sign-in only when NEXDO_APP_URL is configured.
function appLoginUrl() {
  try { return new URL('/login', process.env.NEXDO_APP_URL).href; } catch { return null; }
}

export default function AdminLoginPage() {
  return <AdminLoginForm appLoginUrl={appLoginUrl()}/>;
}
