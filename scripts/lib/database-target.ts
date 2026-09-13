/**
 * Descreve para qual banco um script vai gravar — e decide se precisa de
 * confirmação explícita. Banco que não é local exige `--confirmar-banco <host>`.
 */

const HOSTS_LOCAIS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

export interface DatabaseTarget {
  host: string;
  database: string;
  isLocal: boolean;
}

export function databaseTarget(url = process.env.DIRECT_URL ?? process.env.DATABASE_URL): DatabaseTarget {
  if (!url)
    throw new Error('Defina DATABASE_URL (e DIRECT_URL, se usar pooler) antes de rodar este comando.');
  const alvo = new URL(url);
  return {
    host: alvo.hostname,
    database: decodeURIComponent(alvo.pathname.replace(/^\//, '')),
    isLocal: HOSTS_LOCAIS.has(alvo.hostname),
  };
}

/** Para banco remoto, só segue com `--confirmar-banco` igual ao host. Devolve a descrição do alvo. */
export function requireConfirmedTarget(confirmacao: string | undefined): DatabaseTarget {
  const alvo = databaseTarget();
  if (!alvo.isLocal && confirmacao !== alvo.host) {
    console.error(
      `\nEste comando vai gravar no banco remoto ${alvo.host}/${alvo.database}.\n` +
        `Se é isso mesmo, rode de novo acrescentando:  --confirmar-banco ${alvo.host}\n`,
    );
    process.exit(1);
  }
  return alvo;
}
