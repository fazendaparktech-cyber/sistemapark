'use client';

import { Pencil, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { toast } from 'sonner';

import { api, ApiError, errorMessage } from '@/lib/api-client';
import {
  HOLDER_DATA_LABELS,
  HOLDER_DATA_OPTIONS,
  TICKET_CATEGORIES,
  TICKET_CATEGORY_LABELS,
  type HolderDataKey,
  type SalesChannelKey,
  type TicketCategoryKey,
} from '@/lib/catalog';

import { Alert } from '../../ui/alert';
import { Button } from '../../ui/button';
import { Dialog, DialogContent, DialogTrigger } from '../../ui/dialog';
import { Checkbox, Field, fieldIds, Input, Select, Textarea } from '../../ui/field';
import { MoneyInput } from '../../ui/money-input';

export interface TicketTypeFormInitial {
  id: string;
  name: string;
  description: string | null;
  category: TicketCategoryKey;
  basePriceCents: number;
  minAge: number | null;
  maxAge: number | null;
  holderData: HolderDataKey;
  requiresDocument: boolean;
  documentHint: string | null;
  occupiesCapacity: boolean;
  peoplePerTicket: number;
  dailyQuota: number | null;
  minPerOrder: number | null;
  maxPerOrder: number | null;
  maxPerCustomerPerDay: number | null;
  channels: SalesChannelKey[];
  availableFrom: string | null;
  availableUntil: string | null;
  rulesText: string | null;
  isActive: boolean;
}

function texto(numero: number | null | undefined): string {
  return numero === null || numero === undefined ? '' : String(numero);
}

function numero(valor: string): number | null {
  return valor.trim() ? Number(valor) : null;
}

function soDigitos(valor: string, maximo = 6): string {
  return valor.replace(/\D/g, '').slice(0, maximo);
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className="grid gap-4 border-t border-ink-100 pt-5 first:border-t-0 first:pt-0">
      <legend className="float-left mb-1 w-full font-display text-[15px] font-semibold text-ink-900">
        {titulo}
      </legend>
      {children}
    </fieldset>
  );
}

export function TicketTypeFormDialog({ ticketType }: { ticketType?: TicketTypeFormInitial }) {
  const router = useRouter();
  const editando = Boolean(ticketType);
  const [aberto, setAberto] = useState(false);
  const [versao, setVersao] = useState(0);

  const [nome, setNome] = useState('');
  const [categoria, setCategoria] = useState<TicketCategoryKey>('ADULT');
  const [descricao, setDescricao] = useState('');
  const [preco, setPreco] = useState<number | null>(null);
  const [idadeMinima, setIdadeMinima] = useState('');
  const [idadeMaxima, setIdadeMaxima] = useState('');
  const [dados, setDados] = useState<HolderDataKey>('NAME');
  const [documento, setDocumento] = useState(false);
  const [qualDocumento, setQualDocumento] = useState('');
  const [ocupaVaga, setOcupaVaga] = useState(true);
  const [pessoas, setPessoas] = useState('1');
  const [cota, setCota] = useState('');
  const [minimo, setMinimo] = useState('');
  const [maximo, setMaximo] = useState('');
  const [porCpf, setPorCpf] = useState('');
  const [canais, setCanais] = useState<SalesChannelKey[]>(['ONLINE', 'POS']);
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [regras, setRegras] = useState('');
  const [ativo, setAtivo] = useState(true);

  const [campos, setCampos] = useState<Record<string, string>>({});
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function preencher() {
    setNome(ticketType?.name ?? '');
    setCategoria(ticketType?.category ?? 'ADULT');
    setDescricao(ticketType?.description ?? '');
    setPreco(ticketType?.basePriceCents ?? null);
    setIdadeMinima(texto(ticketType?.minAge));
    setIdadeMaxima(texto(ticketType?.maxAge));
    setDados(ticketType?.holderData ?? 'NAME');
    setDocumento(ticketType?.requiresDocument ?? false);
    setQualDocumento(ticketType?.documentHint ?? '');
    setOcupaVaga(ticketType?.occupiesCapacity ?? true);
    setPessoas(texto(ticketType?.peoplePerTicket ?? 1));
    setCota(texto(ticketType?.dailyQuota));
    setMinimo(texto(ticketType?.minPerOrder));
    setMaximo(texto(ticketType?.maxPerOrder));
    setPorCpf(texto(ticketType?.maxPerCustomerPerDay));
    setCanais(ticketType?.channels ?? ['ONLINE', 'POS']);
    setDe(ticketType?.availableFrom ?? '');
    setAte(ticketType?.availableUntil ?? '');
    setRegras(ticketType?.rulesText ?? '');
    setAtivo(ticketType?.isActive ?? true);
    setCampos({});
    setErro(null);
    setVersao((atual) => atual + 1);
  }

  function mudarAbertura(novo: boolean) {
    if (enviando) return;
    if (novo) preencher();
    setAberto(novo);
  }

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setErro(null);
    const faltando: Record<string, string> = {};
    if (nome.trim().length < 2) faltando.name = 'Informe o nome do ingresso.';
    if (preco === null) faltando.basePriceCents = 'Informe o preço (use 0 para ingresso gratuito).';
    if (canais.length === 0) faltando.channels = 'Escolha onde o ingresso é vendido.';
    if (documento && !qualDocumento.trim())
      faltando.documentHint = 'Diga qual documento o visitante apresenta.';
    setCampos(faltando);
    if (Object.keys(faltando).length > 0) return;

    setEnviando(true);
    try {
      const corpo = {
        name: nome,
        description: descricao || null,
        category: categoria,
        basePriceCents: preco,
        minAge: numero(idadeMinima),
        maxAge: numero(idadeMaxima),
        holderData: dados,
        requiresDocument: documento,
        documentHint: documento ? qualDocumento : null,
        occupiesCapacity: ocupaVaga,
        peoplePerTicket: numero(pessoas) ?? 1,
        dailyQuota: numero(cota),
        minPerOrder: numero(minimo),
        maxPerOrder: numero(maximo),
        maxPerCustomerPerDay: numero(porCpf),
        channels: canais,
        availableFrom: de || null,
        availableUntil: ate || null,
        rulesText: regras || null,
        isActive: ativo,
      };
      const salvo = await api<{ id: string }>(
        editando ? `/api/admin/ticket-types/${ticketType?.id}` : '/api/admin/ticket-types',
        { method: editando ? 'PUT' : 'POST', body: corpo },
      );
      toast.success(
        editando
          ? 'Ingresso atualizado.'
          : `Ingresso ${nome} criado. Agora defina as regras de preço, se houver.`,
      );
      setAberto(false);
      if (editando) router.refresh();
      else router.push(`/admin/ingressos/${salvo.id}`);
    } catch (falha) {
      if (falha instanceof ApiError && Object.keys(falha.fields).length > 0) {
        setCampos(falha.fields);
        setErro('Confira os campos destacados.');
      } else {
        setErro(errorMessage(falha));
      }
    } finally {
      setEnviando(false);
    }
  }

  const alternarCanal = (canal: SalesChannelKey) =>
    setCanais((atual) =>
      atual.includes(canal) ? atual.filter((item) => item !== canal) : [...atual, canal],
    );

  return (
    <Dialog open={aberto} onOpenChange={mudarAbertura}>
      <DialogTrigger asChild>
        {editando ? (
          <Button variant="secondary">
            <Pencil className="size-4" aria-hidden />
            Editar ingresso
          </Button>
        ) : (
          <Button>
            <Plus className="size-4" aria-hidden />
            Novo ingresso
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        title={editando ? `Editar ${ticketType?.name}` : 'Novo tipo de ingresso'}
        description="Preço base, quem pode usar, quantos vender e onde. Promoções e preço por data ficam nas regras de preço."
        size="lg"
      >
        <form onSubmit={salvar} noValidate className="grid gap-5" key={versao}>
          {erro ? <Alert tone="danger">{erro}</Alert> : null}

          <Secao titulo="Ingresso">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="tipo-nome"
                label="Nome"
                required
                hint="Como aparece para o cliente."
                error={campos.name}
              >
                <Input
                  id="tipo-nome"
                  value={nome}
                  maxLength={60}
                  placeholder="Adulto"
                  onChange={(evento) => setNome(evento.target.value)}
                  {...fieldIds('tipo-nome', { hint: true, error: campos.name })}
                />
              </Field>
              <Field id="tipo-categoria" label="Categoria" error={campos.category}>
                <Select
                  id="tipo-categoria"
                  value={categoria}
                  onChange={(evento) => setCategoria(evento.target.value as TicketCategoryKey)}
                >
                  {TICKET_CATEGORIES.map((opcao) => (
                    <option key={opcao} value={opcao}>
                      {TICKET_CATEGORY_LABELS[opcao]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                id="tipo-descricao"
                label="Descrição"
                hint="Aparece abaixo do nome na compra. Ex.: a partir de 12 anos."
                error={campos.description}
                className="sm:col-span-2"
              >
                <Input
                  id="tipo-descricao"
                  value={descricao}
                  maxLength={300}
                  onChange={(evento) => setDescricao(evento.target.value)}
                  {...fieldIds('tipo-descricao', { hint: true, error: campos.description })}
                />
              </Field>
              <Field
                id="tipo-preco"
                label="Preço base"
                required
                hint="Vale quando nenhuma regra de preço se aplica. Use 0 para gratuito."
                error={campos.basePriceCents}
              >
                <MoneyInput
                  id="tipo-preco"
                  valueCents={preco}
                  onValueChange={setPreco}
                  {...fieldIds('tipo-preco', { hint: true, error: campos.basePriceCents })}
                />
              </Field>
              <div className="flex items-end gap-6 pb-2.5">
                <label className="flex cursor-pointer items-center gap-2.5 text-sm font-semibold text-ink-800">
                  <Checkbox checked={ativo} onChange={(evento) => setAtivo(evento.target.checked)} />
                  Ingresso ativo
                </label>
              </div>
            </div>
          </Secao>

          <Secao titulo="Quem usa">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field id="tipo-idade-min" label="Idade mínima" error={campos.minAge}>
                <Input
                  id="tipo-idade-min"
                  inputMode="numeric"
                  placeholder="Sem mínimo"
                  value={idadeMinima}
                  onChange={(evento) => setIdadeMinima(soDigitos(evento.target.value, 3))}
                  {...fieldIds('tipo-idade-min', { error: campos.minAge })}
                />
              </Field>
              <Field id="tipo-idade-max" label="Idade máxima" error={campos.maxAge}>
                <Input
                  id="tipo-idade-max"
                  inputMode="numeric"
                  placeholder="Sem máximo"
                  value={idadeMaxima}
                  onChange={(evento) => setIdadeMaxima(soDigitos(evento.target.value, 3))}
                  {...fieldIds('tipo-idade-max', { error: campos.maxAge })}
                />
              </Field>
              <Field id="tipo-dados" label="Dados pedidos de cada visitante" error={campos.holderData}>
                <Select
                  id="tipo-dados"
                  value={dados}
                  onChange={(evento) => setDados(evento.target.value as HolderDataKey)}
                >
                  {HOLDER_DATA_OPTIONS.map((opcao) => (
                    <option key={opcao} value={opcao}>
                      {HOLDER_DATA_LABELS[opcao]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <p className="-mt-2 text-[13px] text-ink-500">
              Com data de nascimento, a idade é conferida na data da visita. Com nome, a portaria vê quem é o
              titular.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink-800">
                <Checkbox
                  checked={documento}
                  onChange={(evento) => setDocumento(evento.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Exige documento na entrada
                  <span className="block text-[13px] text-ink-500">
                    Ex.: meia-entrada, idoso, morador da cidade.
                  </span>
                </span>
              </label>
              {documento ? (
                <Field id="tipo-documento" label="Qual documento" required error={campos.documentHint}>
                  <Input
                    id="tipo-documento"
                    value={qualDocumento}
                    maxLength={120}
                    placeholder="Carteira de estudante válida"
                    onChange={(evento) => setQualDocumento(evento.target.value)}
                    {...fieldIds('tipo-documento', { error: campos.documentHint })}
                  />
                </Field>
              ) : null}
            </div>
          </Secao>

          <Secao titulo="Quantidade e lotação">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="tipo-pessoas"
                label="Pessoas por ingresso"
                hint="Combo família com 4 pessoas = 4. Cada pessoa recebe um QR Code."
                error={campos.peoplePerTicket}
              >
                <Input
                  id="tipo-pessoas"
                  inputMode="numeric"
                  value={pessoas}
                  onChange={(evento) => setPessoas(soDigitos(evento.target.value, 2))}
                  {...fieldIds('tipo-pessoas', { hint: true, error: campos.peoplePerTicket })}
                />
              </Field>
              <label className="flex cursor-pointer items-start gap-2.5 pt-7 text-sm text-ink-800">
                <Checkbox
                  checked={ocupaVaga}
                  onChange={(evento) => setOcupaVaga(evento.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Ocupa vaga da lotação do dia
                  <span className="block text-[13px] text-ink-500">
                    Desmarque, por exemplo, para criança de colo.
                  </span>
                </span>
              </label>
              <Field
                id="tipo-cota"
                label="Limite por dia"
                hint="Em branco: limitado só pela lotação."
                error={campos.dailyQuota}
              >
                <Input
                  id="tipo-cota"
                  inputMode="numeric"
                  placeholder="Sem limite próprio"
                  value={cota}
                  onChange={(evento) => setCota(soDigitos(evento.target.value))}
                  {...fieldIds('tipo-cota', { hint: true, error: campos.dailyQuota })}
                />
              </Field>
              <Field id="tipo-cpf" label="Máximo por CPF na mesma data" error={campos.maxPerCustomerPerDay}>
                <Input
                  id="tipo-cpf"
                  inputMode="numeric"
                  placeholder="Sem limite"
                  value={porCpf}
                  onChange={(evento) => setPorCpf(soDigitos(evento.target.value, 3))}
                  {...fieldIds('tipo-cpf', { error: campos.maxPerCustomerPerDay })}
                />
              </Field>
              <Field id="tipo-minimo" label="Mínimo por pedido" error={campos.minPerOrder}>
                <Input
                  id="tipo-minimo"
                  inputMode="numeric"
                  placeholder="Sem mínimo"
                  value={minimo}
                  onChange={(evento) => setMinimo(soDigitos(evento.target.value, 3))}
                  {...fieldIds('tipo-minimo', { error: campos.minPerOrder })}
                />
              </Field>
              <Field id="tipo-maximo" label="Máximo por pedido" error={campos.maxPerOrder}>
                <Input
                  id="tipo-maximo"
                  inputMode="numeric"
                  placeholder="Sem máximo"
                  value={maximo}
                  onChange={(evento) => setMaximo(soDigitos(evento.target.value, 3))}
                  {...fieldIds('tipo-maximo', { error: campos.maxPerOrder })}
                />
              </Field>
            </div>
          </Secao>

          <Secao titulo="Onde e quando vender">
            <div className="flex flex-wrap gap-5">
              {(
                [
                  ['ONLINE', 'Site'],
                  ['POS', 'Bilheteria'],
                ] as const
              ).map(([canal, rotulo]) => (
                <label key={canal} className="flex cursor-pointer items-center gap-2.5 text-sm text-ink-800">
                  <Checkbox checked={canais.includes(canal)} onChange={() => alternarCanal(canal)} />
                  {rotulo}
                </label>
              ))}
            </div>
            {campos.channels ? (
              <p className="-mt-2 text-[13px] font-medium text-danger-700">{campos.channels}</p>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                id="tipo-de"
                label="Visitas a partir de"
                hint="Em branco: sem data inicial."
                error={campos.availableFrom}
              >
                <Input
                  id="tipo-de"
                  type="date"
                  value={de}
                  onChange={(evento) => setDe(evento.target.value)}
                />
              </Field>
              <Field
                id="tipo-ate"
                label="Visitas até"
                hint="Em branco: sem data final."
                error={campos.availableUntil}
              >
                <Input
                  id="tipo-ate"
                  type="date"
                  value={ate}
                  onChange={(evento) => setAte(evento.target.value)}
                />
              </Field>
            </div>
            <Field
              id="tipo-regras"
              label="Regras mostradas ao cliente"
              hint="Ex.: obrigatório apresentar documento com foto na entrada."
              error={campos.rulesText}
            >
              <Textarea
                id="tipo-regras"
                value={regras}
                maxLength={1000}
                onChange={(evento) => setRegras(evento.target.value)}
                {...fieldIds('tipo-regras', { hint: true, error: campos.rulesText })}
              />
            </Field>
          </Secao>

          <div className="flex flex-col-reverse gap-2 border-t border-ink-100 pt-5 sm:flex-row sm:justify-end">
            <Button variant="secondary" onClick={() => mudarAbertura(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button type="submit" loading={enviando}>
              {editando ? 'Salvar alterações' : 'Criar ingresso'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
