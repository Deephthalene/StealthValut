import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/atoms';
import { LoginForm } from '@/components/molecules';

interface LoginCardProps {
  onLogin: (username: string, password: string) => void | Promise<void>;
  isLoading?: boolean;
  error?: string;
}

function LoginCard({ onLogin, isLoading, error }: LoginCardProps) {
  return (
    <Card className="w-full max-w-xl p-10">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl text-center">Admin</CardTitle>
        <CardDescription className="text-center">
          관리자 계정으로 로그인하세요
        </CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm onSubmit={onLogin} isLoading={isLoading} error={error} />
      </CardContent>
    </Card>
  );
}

export default LoginCard;
