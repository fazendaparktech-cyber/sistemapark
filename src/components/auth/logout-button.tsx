'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import { api, errorMessage } from '@/lib/api-client';

import { Button, type ButtonProps } from '../ui/button';

export function useLogout() {
  const router = useRouter();
  const [saindo, setSaindo] = useState(false);

  async function sair() {
    setSaindo(true);
    try {
      await api('/api/auth/logout', { method: 'POST' });
      router.replace('/entrar');
      router.refresh();
    } catch (falha) {
      toast.error(errorMessage(falha));
      setSaindo(false);
    }
  }

  return { sair, saindo };
}

export function LogoutButton({ children = 'Sair', ...props }: Omit<ButtonProps, 'onClick' | 'loading'>) {
  const { sair, saindo } = useLogout();
  return (
    <Button variant="ghost" onClick={sair} loading={saindo} {...props}>
      {saindo ? null : <LogOut className="size-4" aria-hidden />}
      {children}
    </Button>
  );
}
