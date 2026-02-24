import { AuthLayout, LoginCard } from '@/components/templates';
import { ROLE, useAuthStore } from '@/stores/useAuthStore';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const { login } = useAuthStore();

  const devToken = [
    btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT' })),
    btoa(
      JSON.stringify({
        sub: 'admin',
        exp: Math.floor(Date.now() / 1000) + 60 * 60,
      }),
    ),
    'dev-signature',
  ].join('.');

  const onLogin = async (
    username: string,
    _password: string,
  ): Promise<void> => {
    setError(undefined);
    setIsLoading(true);
    try {
      await new Promise((r) => setTimeout(r, 500));
      localStorage.setItem('token', devToken);
      login(
        { userId: username, role: ROLE.ADMIN, loginIpAddress: '' },
        devToken,
      );
      navigate('/app', { replace: true });
    } catch {
      setError('로그인에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      <LoginCard onLogin={onLogin} isLoading={isLoading} error={error} />
    </AuthLayout>
  );
}
