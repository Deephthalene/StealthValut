import { Button, Input, Label } from '@/components/atoms';
import { FormEvent, useState } from 'react';

interface LoginFormProps {
  onSubmit: (userId: string, password: string) => void | Promise<void>;
  isLoading?: boolean;
  error?: string;
}

function LoginForm({ onSubmit, isLoading, error }: LoginFormProps) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await onSubmit(userId, password);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1 flex flex-col">
        <Label htmlFor="userId">아이디</Label>
        <Input
          className="h-10"
          id="userId"
          type="text"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="아이디를 입력하세요"
          required
          disabled={isLoading}
        />
      </div>

      <div className="space-y-2 flex flex-col">
        <Label htmlFor="password">비밀번호</Label>
        <Input
          className="h-10"
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호를 입력하세요"
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
        {isLoading ? '로그인 중...' : '로그인'}
      </Button>
    </form>
  );
}

export default LoginForm;
