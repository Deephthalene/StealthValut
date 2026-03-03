import { Button, Input, Label } from '@/components/atoms';
import { FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface LoginFormProps {
  onSubmit: (userId: string, password: string) => void | Promise<void>;
  isLoading?: boolean;
  error?: string;
}

function LoginForm({ onSubmit, isLoading, error }: LoginFormProps) {
  const { t } = useTranslation();
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await onSubmit(userId, password);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1 flex flex-col">
        <Label htmlFor="userId">{t('login.userId')}</Label>
        <Input
          className="h-10"
          id="userId"
          type="text"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder={t('login.userIdPlaceholder')}
          required
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2 flex flex-col">
        <Label htmlFor="password">{t('login.password')}</Label>
        <Input
          className="h-10"
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('login.passwordPlaceholder')}
          required
          disabled={isLoading}
        />
      </div>

      {error && <div className="text-sm text-destructive">{error}</div>}

      <Button
        type="submit"
        variant="secondary"
        className="w-full"
        disabled={isLoading}
      >
        {isLoading ? t('login.loggingIn') : t('login.login')}
      </Button>
    </form>
  );
}

export default LoginForm;
