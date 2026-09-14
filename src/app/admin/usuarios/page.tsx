import type { Metadata } from 'next';
import Link from 'next/link';

import { NoPermission } from '@/components/admin/no-permission';
import { CreateUserDialog } from '@/components/admin/team/create-user-dialog';
import { cn } from '@/components/ui/cn';
import { PageHeader } from '@/components/ui/page-header';
import { SUPER_ADMIN_ROLE } from '@/lib/access';
import { listRoles } from '@/server/access/service';
import { can } from '@/server/auth/context';
import { requirePageAuth } from '@/server/auth/guards';

import { AbaAtividade } from './_abas/atividade';
import { AbaEquipe } from './_abas/equipe';
import { AbaPerfis } from './_abas/perfis';

export const metadata: Metadata = { title: 'Usuários' };

const ABAS = [
  {
    chave: 'equipe',
    rotulo: 'Equipe',
    permissao: 'users.view',
    descricao: 'Quem acessa o sistema, com qual perfil, e quando entrou pela última vez.',
  },
  {
    chave: 'perfis',
    rotulo: 'Perfis e permissões',
    permissao: 'users.view',
    descricao: 'O que cada perfil pode ver e fazer. O sistema confere estas regras no servidor em toda ação.',
  },
  {
    chave: 'atividade',
    rotulo: 'Atividade',
    permissao: 'audit.view',
    descricao:
      'Tudo o que foi feito no sistema: quem, o quê, quando e de onde. Os registros não podem ser alterados nem apagados.',
  },
] as const;

export default async function UsuariosPage({ searchParams }: PageProps<'/admin/usuarios'>) {
  const auth = await requirePageAuth();
  const disponiveis = ABAS.filter((item) => can(auth, item.permissao));
  const primeira = disponiveis[0];
  if (!primeira) return <NoPermission />;

  const parametros = await searchParams;
  const pedida = typeof parametros.aba === 'string' ? parametros.aba : undefined;
  const aba = disponiveis.find((item) => item.chave === pedida) ?? primeira;

  let acao = null;
  if (aba.chave === 'equipe' && can(auth, 'users.manage')) {
    const papeis = await listRoles(auth);
    const opcoes = papeis
      .filter((papel) => papel.key !== SUPER_ADMIN_ROLE || auth.isSuperAdmin)
      .filter(
        (papel) =>
          auth.isSuperAdmin || papel.permissions.every((permissao) => auth.permissions.has(permissao)),
      )
      .map((papel) => ({ key: papel.key, name: papel.name, description: papel.description }));
    acao = <CreateUserDialog roleOptions={opcoes} />;
  }

  return (
    <div className="grid gap-6">
      <PageHeader title="Usuários" description={aba.descricao} actions={acao} />

      {disponiveis.length > 1 ? (
        <nav
          aria-label="Seções de usuários"
          className="flex gap-1 overflow-x-auto rounded-xl bg-ink-100/70 p-1 sm:w-fit"
        >
          {disponiveis.map((item) => (
            <Link
              key={item.chave}
              href={item.chave === primeira.chave ? '/admin/usuarios' : `/admin/usuarios?aba=${item.chave}`}
              aria-current={aba.chave === item.chave ? 'page' : undefined}
              className={cn(
                'flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-center text-sm font-semibold transition-colors sm:flex-none',
                aba.chave === item.chave
                  ? 'bg-white text-ink-900 shadow-card'
                  : 'text-ink-600 hover:text-ink-900',
              )}
            >
              {item.rotulo}
            </Link>
          ))}
        </nav>
      ) : null}

      {aba.chave === 'equipe' ? (
        <AbaEquipe auth={auth} parametros={parametros} />
      ) : aba.chave === 'perfis' ? (
        <AbaPerfis auth={auth} />
      ) : (
        <AbaAtividade auth={auth} parametros={parametros} />
      )}
    </div>
  );
}
