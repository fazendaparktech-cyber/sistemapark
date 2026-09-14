'use client';

import { CircleCheck, CircleX, Ellipsis, Link2, Mail, RefreshCw, Undo2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { DropdownMenu } from 'radix-ui';
import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { api, ApiError, errorMessage } from '@/lib/api-client';

import { Alert } from '../../ui/alert';
import { Button } from '../../ui/button';
import { CopyButton } from '../../ui/copy-button';
import { Dialog, DialogContent } from '../../ui/dialog';
import { Field, fieldIds, Textarea } from '../../ui/field';

interface Acoes {
  canCancel: boolean;
  canRefund: boolean;
  canResend: boolean;
  canRegenerateLink: boolean;
  canReconcile: boolean;
  canSimulatePayment: boolean;
}

const ITEM =
  'flex w-full cursor-pointer select-none items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-700 outline-none data-[highlighted]:bg-ink-100 data-[highlighted]:text-ink-900 data-[disabled]:opacity-50';

type Janela = 'cancelar' | 'reembolsar' | 'novo-link' | null;

export function OrderActions({
  orderId,
  code,
  totalLabel,
  publicUrl,
  reconcilePaymentId,
  actions,
}: {
  orderId: string;
  code: string;
  totalLabel: string;
  publicUrl: string | null;
  reconcilePaymentId: string | null;
  actions: Acoes;
}) {
  const router = useRouter();
  const [janela, setJanela] = useState<Janela>(null);
  const [motivo, setMotivo] = useState('');
  const [erroDoMotivo, setErroDoMotivo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [novoLink, setNovoLink] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const temMaisAcoes =
    actions.canResend ||
    actions.canRegenerateLink ||
    (actions.canReconcile && reconcilePaymentId) ||
    actions.canSimulatePayment;

  function abrir(nova: Janela) {
    setMotivo('');
    setErro(null);
    setErroDoMotivo(null);
    setNovoLink(null);
    setJanela(nova);
  }

  function mudarAbertura(aberta: boolean) {
    if (enviando) return;
    if (!aberta) {
      if (novoLink) router.refresh();
      setJanela(null);
    }
  }

  async function executar(acao: () => Promise<unknown>, sucesso: string) {
    setOcupado(true);
    try {
      await acao();
      toast.success(sucesso);
      router.refresh();
    } catch (falha) {
      toast.error(errorMessage(falha));
    } finally {
      setOcupado(false);
    }
  }

  async function enviarMotivo(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (motivo.trim().length < 5) {
      setErroDoMotivo('Escreva o motivo com pelo menos 5 caracteres.');
      return;
    }
    setEnviando(true);
    setErro(null);
    setErroDoMotivo(null);
    try {
      const reembolso = janela === 'reembolsar';
      await api(`/api/admin/orders/${orderId}/${reembolso ? 'refund' : 'cancel'}`, {
        method: 'POST',
        body: { reason: motivo },
      });
      toast.success(reembolso ? 'Reembolso feito e pedido cancelado.' : 'Pedido cancelado.');
      setJanela(null);
      router.refresh();
    } catch (falha) {
      if (falha instanceof ApiError && falha.fields.reason) setErroDoMotivo(falha.fields.reason);
      else setErro(errorMessage(falha));
    } finally {
      setEnviando(false);
    }
  }

  async function gerarNovoLink() {
    setEnviando(true);
    setErro(null);
    try {
      const resultado = await api<{ publicUrl: string }>(`/api/admin/orders/${orderId}/link`, {
        method: 'POST',
      });
      setNovoLink(resultado.publicUrl);
    } catch (falha) {
      setErro(errorMessage(falha));
    } finally {
      setEnviando(false);
    }
  }

  const reembolso = janela === 'reembolsar';

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {publicUrl ? <CopyButton value={publicUrl} label="Copiar link do cliente" /> : null}
        {actions.canRefund ? (
          <Button variant="danger-soft" onClick={() => abrir('reembolsar')}>
            <Undo2 className="size-4" aria-hidden />
            Reembolsar
          </Button>
        ) : null}
        {actions.canCancel ? (
          <Button variant="danger-soft" onClick={() => abrir('cancelar')}>
            <CircleX className="size-4" aria-hidden />
            Cancelar pedido
          </Button>
        ) : null}
        {temMaisAcoes ? (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button variant="secondary" size="icon" aria-label="Mais ações do pedido" loading={ocupado}>
                {ocupado ? null : <Ellipsis className="size-4" aria-hidden />}
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={8}
                className="z-50 min-w-64 rounded-xl bg-white p-1.5 shadow-pop ring-1 ring-ink-200 data-[state=open]:animate-rise-in"
              >
                {actions.canResend ? (
                  <DropdownMenu.Item
                    className={ITEM}
                    onSelect={() =>
                      void executar(
                        () => api(`/api/admin/orders/${orderId}/resend`, { method: 'POST' }),
                        'E-mail reenviado ao comprador.',
                      )
                    }
                  >
                    <Mail className="size-4 text-ink-500" aria-hidden />
                    Reenviar e-mail do pedido
                  </DropdownMenu.Item>
                ) : null}
                {actions.canRegenerateLink ? (
                  <DropdownMenu.Item className={ITEM} onSelect={() => abrir('novo-link')}>
                    <Link2 className="size-4 text-ink-500" aria-hidden />
                    Gerar novo link do cliente
                  </DropdownMenu.Item>
                ) : null}
                {actions.canReconcile && reconcilePaymentId ? (
                  <DropdownMenu.Item
                    className={ITEM}
                    onSelect={() =>
                      void executar(
                        () => api(`/api/admin/payments/${reconcilePaymentId}/reconcile`, { method: 'POST' }),
                        'Situação do pagamento atualizada com o provedor.',
                      )
                    }
                  >
                    <RefreshCw className="size-4 text-ink-500" aria-hidden />
                    Consultar pagamento no provedor
                  </DropdownMenu.Item>
                ) : null}
                {actions.canSimulatePayment ? (
                  <>
                    <DropdownMenu.Separator className="my-1 h-px bg-ink-100" />
                    <DropdownMenu.Label className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
                      Ambiente de teste
                    </DropdownMenu.Label>
                    <DropdownMenu.Item
                      className={ITEM}
                      onSelect={() =>
                        void executar(
                          () =>
                            api(`/api/admin/orders/${orderId}/simulate-payment`, {
                              method: 'POST',
                              body: { outcome: 'APPROVED' },
                            }),
                          'Pagamento simulado como aprovado.',
                        )
                      }
                    >
                      <CircleCheck className="size-4 text-success-700" aria-hidden />
                      Simular PIX aprovado
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className={ITEM}
                      onSelect={() =>
                        void executar(
                          () =>
                            api(`/api/admin/orders/${orderId}/simulate-payment`, {
                              method: 'POST',
                              body: { outcome: 'DECLINED' },
                            }),
                          'Pagamento simulado como recusado.',
                        )
                      }
                    >
                      <CircleX className="size-4 text-danger-700" aria-hidden />
                      Simular PIX recusado
                    </DropdownMenu.Item>
                  </>
                ) : null}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        ) : null}
      </div>

      <Dialog open={janela === 'cancelar' || janela === 'reembolsar'} onOpenChange={mudarAbertura}>
        <DialogContent
          title={reembolso ? `Reembolsar o pedido ${code}` : `Cancelar o pedido ${code}`}
          description={
            reembolso
              ? `O valor de ${totalLabel} volta para o cliente pelo mesmo meio de pagamento, os ingressos deixam de valer e o cliente recebe um e-mail.`
              : 'Os ingressos deixam de valer, as vagas voltam para venda e o cliente recebe um e-mail.'
          }
          size="sm"
        >
          <form onSubmit={enviarMotivo} noValidate className="grid gap-4">
            {erro ? <Alert tone="danger">{erro}</Alert> : null}
            <Field
              id="motivo-do-pedido"
              label="Motivo"
              required
              hint="Fica registrado no histórico do pedido e na auditoria."
              error={erroDoMotivo}
            >
              <Textarea
                id="motivo-do-pedido"
                value={motivo}
                maxLength={300}
                onChange={(evento) => setMotivo(evento.target.value)}
                placeholder={
                  reembolso
                    ? 'Ex.: parque fechado por chuva no dia da visita'
                    : 'Ex.: cliente desistiu da compra'
                }
                {...fieldIds('motivo-do-pedido', { hint: true, error: erroDoMotivo })}
              />
            </Field>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => mudarAbertura(false)} disabled={enviando}>
                Voltar
              </Button>
              <Button type="submit" variant="danger" loading={enviando}>
                {reembolso ? `Reembolsar ${totalLabel}` : 'Cancelar pedido'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={janela === 'novo-link'} onOpenChange={mudarAbertura}>
        <DialogContent
          title={novoLink ? 'Novo link gerado' : 'Gerar novo link do cliente'}
          description={
            novoLink
              ? 'Envie este link ao cliente. O link anterior não abre mais o pedido.'
              : 'Use quando o link do pedido foi compartilhado por engano. O link atual deixa de funcionar na hora; os QR Codes dos ingressos continuam valendo.'
          }
          size="sm"
        >
          {erro ? (
            <Alert tone="danger" className="mb-4">
              {erro}
            </Alert>
          ) : null}
          {novoLink ? (
            <div className="grid gap-3">
              <code className="break-all rounded-xl bg-ink-50 px-3.5 py-2.5 font-mono text-[13px] text-ink-800 ring-1 ring-inset ring-ink-200">
                {novoLink}
              </code>
              <CopyButton value={novoLink} label="Copiar novo link" />
              <Button onClick={() => mudarAbertura(false)}>Concluir</Button>
            </div>
          ) : (
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="secondary" onClick={() => mudarAbertura(false)} disabled={enviando}>
                Voltar
              </Button>
              <Button onClick={gerarNovoLink} loading={enviando}>
                Gerar novo link
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
