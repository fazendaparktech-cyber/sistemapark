import { Lock } from 'lucide-react';
import Link from 'next/link';

import { buttonClasses } from '../ui/button';
import { Card } from '../ui/card';
import { EmptyState } from '../ui/feedback';

/** Mostrado quando a pessoa abre uma área do painel sem a permissão necessária. */
export function NoPermission({ description }: { description?: string }) {
  return (
    <Card className="mx-auto mt-4 max-w-lg">
      <EmptyState
        icon={Lock}
        title="Você não tem acesso a esta área"
        description={
          description ??
          'Se você precisa dela no seu trabalho, peça a quem administra o sistema para ajustar o seu papel.'
        }
        action={
          <Link href="/admin" className={buttonClasses('secondary')}>
            Voltar para a visão geral
          </Link>
        }
      />
    </Card>
  );
}
