import type { UserStatus } from '@/generated/prisma/enums';

import { StatusBadge, type StatusBadgeKey } from '../../ui/badge';

const SITUACAO: Record<UserStatus, StatusBadgeKey> = {
  ACTIVE: 'ATIVO',
  SUSPENDED: 'SUSPENSO',
  DISABLED: 'DESATIVADO',
};

export function StaffStatusBadge({ status }: { status: UserStatus }) {
  return <StatusBadge status={SITUACAO[status]} />;
}
